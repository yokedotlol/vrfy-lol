// Package vrfy provides a Go client for the vrfy.lol email validation API.
//
// The client transparently handles proof-of-work challenges when rate limits
// are exceeded, so callers never need to think about it.
//
// Basic usage:
//
//	result, err := vrfy.Validate("user@example.com")
//	if err != nil {
//	    log.Fatal(err)
//	}
//	fmt.Println(result.Action) // "allow", "verify", or "block"
package vrfy

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"strconv"
	"time"
)

const (
	DefaultBaseURL = "https://vrfy.lol"
	DefaultTimeout = 30 * time.Second
	maxResponseBytes = 10 << 20 // 10 MB
)

// Client is a vrfy.lol API client.
type Client struct {
	BaseURL    string
	HTTPClient *http.Client
}

// NewClient creates a client with sensible defaults.
func NewClient() *Client {
	return &Client{
		BaseURL: DefaultBaseURL,
		HTTPClient: &http.Client{
			Timeout: DefaultTimeout,
		},
	}
}

// defaultClient is used by the package-level convenience functions.
var defaultClient = NewClient()

// Validate checks a single email address.
// Automatically solves proof-of-work challenges if rate-limited.
func Validate(email string) (*Result, error) {
	return defaultClient.Validate(email)
}

// ValidateBatch checks up to 20 email addresses.
// Automatically solves proof-of-work challenges if rate-limited.
func ValidateBatch(emails []string) (*BatchResult, error) {
	return defaultClient.ValidateBatch(emails)
}

// ValidateOpts checks a single email with options.
func ValidateOpts(email string, opts *Options) (*Result, error) {
	return defaultClient.ValidateOpts(email, opts)
}

// Options controls optional API behavior.
type Options struct {
	Quick bool   // Tier 1 only (skip enrichment/security)
	Force bool   // Bypass server cache
	DKIM  string // "full" for extended DKIM probing
}

// Validate checks a single email address.
func (c *Client) Validate(email string) (*Result, error) {
	return c.ValidateOpts(email, nil)
}

// ValidateOpts checks a single email with options.
func (c *Client) ValidateOpts(email string, opts *Options) (*Result, error) {
	body := singleRequest{Email: email}
	if opts != nil {
		body.Quick = opts.Quick
		body.Force = opts.Force
		body.DKIM = opts.DKIM
	}

	data, err := c.doWithPow(c.BaseURL+"/", body)
	if err != nil {
		return nil, err
	}

	var result Result
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, fmt.Errorf("vrfy: invalid response: %w", err)
	}
	return &result, nil
}

// ValidateBatch checks up to 20 email addresses.
func (c *Client) ValidateBatch(emails []string) (*BatchResult, error) {
	if len(emails) == 0 {
		return nil, fmt.Errorf("vrfy: empty email list")
	}
	if len(emails) > 20 {
		return nil, fmt.Errorf("vrfy: batch size %d exceeds maximum of 20", len(emails))
	}

	body := batchRequest{Emails: emails}
	data, err := c.doWithPow(c.BaseURL+"/batch", body)
	if err != nil {
		return nil, err
	}

	var result BatchResult
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, fmt.Errorf("vrfy: invalid response: %w", err)
	}
	return &result, nil
}

// ─── Internal request/response types ───

type singleRequest struct {
	Email string       `json:"email"`
	Quick bool         `json:"quick,omitempty"`
	Force bool         `json:"force,omitempty"`
	DKIM  string       `json:"dkim,omitempty"`
	PoW   *powSolution `json:"pow,omitempty"`
}

type batchRequest struct {
	Emails []string     `json:"emails"`
	Quick  bool         `json:"quick,omitempty"`
	Force  bool         `json:"force,omitempty"`
	PoW    *powSolution `json:"pow,omitempty"`
}

type powSolution struct {
	Challenge string `json:"challenge"`
	Nonce     string `json:"nonce"`
}

type errorResponse struct {
	Error   string       `json:"error"`
	Message string       `json:"message"`
	PoW     *powChallenge `json:"pow,omitempty"`
}

type powChallenge struct {
	Algorithm  string `json:"algorithm"`
	Challenge  string `json:"challenge"`
	Difficulty int    `json:"difficulty"`
	Expires    int64  `json:"expires"`
}

// ─── HTTP + PoW solving ───

// doWithPow makes a POST request and transparently handles 429 + PoW.
func (c *Client) doWithPow(url string, body interface{}) ([]byte, error) {
	// First attempt
	data, statusCode, err := c.post(url, body)
	if err != nil {
		return nil, err
	}

	if statusCode == 200 {
		return data, nil
	}

	if statusCode != 429 {
		var apiErr errorResponse
		if json.Unmarshal(data, &apiErr) == nil && apiErr.Message != "" {
			return nil, fmt.Errorf("vrfy: API error %d: %s", statusCode, apiErr.Message)
		}
		return nil, fmt.Errorf("vrfy: unexpected status %d", statusCode)
	}

	// 429 — parse the challenge and solve it
	var apiErr errorResponse
	if err := json.Unmarshal(data, &apiErr); err != nil {
		return nil, fmt.Errorf("vrfy: rate limited but could not parse challenge: %w", err)
	}
	if apiErr.PoW == nil {
		return nil, fmt.Errorf("vrfy: rate limited with no PoW challenge")
	}

	nonce, err := solvePoW(apiErr.PoW.Challenge, apiErr.PoW.Difficulty)
	if err != nil {
		return nil, fmt.Errorf("vrfy: failed to solve PoW: %w", err)
	}

	// Inject the solution and retry
	solved := &powSolution{
		Challenge: apiErr.PoW.Challenge,
		Nonce:     strconv.FormatUint(nonce, 10),
	}

	switch v := body.(type) {
	case singleRequest:
		v.PoW = solved
		body = v
	case batchRequest:
		v.PoW = solved
		body = v
	}

	data, statusCode, err = c.post(url, body)
	if err != nil {
		return nil, err
	}
	if statusCode != 200 {
		return nil, fmt.Errorf("vrfy: request failed after PoW (status %d)", statusCode)
	}
	return data, nil
}

func (c *Client) post(url string, body interface{}) ([]byte, int, error) {
	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, 0, fmt.Errorf("vrfy: marshal error: %w", err)
	}

	req, err := http.NewRequest("POST", url, bytes.NewReader(jsonBody))
	if err != nil {
		return nil, 0, fmt.Errorf("vrfy: request error: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "vrfy-go/1.0")

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("vrfy: request failed: %w", err)
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes))
	if err != nil {
		return nil, 0, fmt.Errorf("vrfy: read error: %w", err)
	}
	return data, resp.StatusCode, nil
}

// ─── Proof of Work solver ───

// solvePoW finds a nonce where SHA-256(challenge + ":" + nonce) has >= difficulty leading zero bits.
func solvePoW(challenge string, difficulty int) (uint64, error) {
	if difficulty <= 0 || difficulty > 64 {
		return 0, fmt.Errorf("invalid difficulty %d", difficulty)
	}

	prefix := []byte(challenge + ":")

	for nonce := uint64(0); nonce < math.MaxUint64; nonce++ {
		nonceStr := strconv.FormatUint(nonce, 10)
		input := make([]byte, len(prefix)+len(nonceStr))
		copy(input, prefix)
		copy(input[len(prefix):], nonceStr)

		hash := sha256.Sum256(input)
		if countLeadingZeroBits(hash[:]) >= difficulty {
			return nonce, nil
		}
	}
	return 0, fmt.Errorf("exhausted nonce space")
}

// countLeadingZeroBits counts leading zero bits in a byte slice.
func countLeadingZeroBits(hash []byte) int {
	bits := 0
	for _, b := range hash {
		if b == 0 {
			bits += 8
			continue
		}
		// Count leading zeros in this byte
		bits += int(clz8(b))
		break
	}
	return bits
}

// clz8 counts leading zeros in a single byte.
func clz8(b byte) uint8 {
	n := uint8(0)
	if b == 0 {
		return 8
	}
	for mask := byte(0x80); mask != 0 && b&mask == 0; mask >>= 1 {
		n++
	}
	return n
}

// ─── Exported response types ───

// Result is the response from a single email validation.
type Result struct {
	Email      string           `json:"email"`
	Action     string           `json:"action"`
	Confidence string           `json:"confidence"`
	Validation ValidationResult `json:"validation"`
	Enrichment *EnrichmentResult `json:"enrichment,omitempty"`
	Security   *SecurityResult   `json:"security,omitempty"`
	Meta       MetaResult       `json:"_meta"`
}

// BatchResult is the response from a batch validation.
type BatchResult struct {
	Results        []Result `json:"results"`
	BatchMs        int      `json:"batch_ms"`
	DomainsQueried int      `json:"domains_queried"`
}

// ValidationResult contains Tier 1 core validation signals.
type ValidationResult struct {
	SyntaxValid         bool          `json:"syntax_valid"`
	MXFound             bool          `json:"mx_found"`
	NullMX              bool          `json:"null_mx"`
	Disposable          bool          `json:"disposable"`
	PrivacyRelay        bool          `json:"privacy_relay"`
	PrivacyRelayService *string       `json:"privacy_relay_service"`
	FreeProvider        bool          `json:"free_provider"`
	RoleAccount         bool          `json:"role_account"`
	HasTypo             bool          `json:"has_typo"`
	TypoSuggestion      *string       `json:"typo_suggestion"`
	Provider            *ProviderInfo `json:"provider"`
	Subaddressed        bool          `json:"subaddressed"`
	SubaddressTag       *string       `json:"subaddress_tag"`
	SubaddressBase      *string       `json:"subaddress_base"`
}

// ProviderInfo identifies the email service provider.
type ProviderInfo struct {
	Name              string `json:"name"`
	IsFree            bool   `json:"is_free"`
	CatchAllDefault   bool   `json:"catch_all_default"`
	SMTPVerification  string `json:"smtp_verification"`
	Note              string `json:"note"`
}

// EnrichmentResult contains Tier 2 enrichment signals.
type EnrichmentResult struct {
	DomainAgeDays    *int   `json:"domain_age_days"`
	RegisteredDate   *string `json:"registered_date"`
	DNSBLListed      bool   `json:"dnsbl_listed"`
	DNSBLChecked     int    `json:"dnsbl_lists_checked"`
	CatchAllLikely   bool   `json:"catch_all_likely"`
}

// SecurityResult contains Tier 3 email security posture.
type SecurityResult struct {
	Grade         string      `json:"grade"`
	SPF           bool        `json:"spf"`
	DKIM          bool        `json:"dkim"`
	DKIMSelectors []string    `json:"dkim_selectors"`
	DMARC         DMARCResult `json:"dmarc"`
	MTASTS        bool        `json:"mta_sts"`
	TLSRPT        bool        `json:"tls_rpt"`
	BIMI          bool        `json:"bimi"`
}

// DMARCResult contains DMARC policy info.
type DMARCResult struct {
	Found  bool    `json:"found"`
	Policy *string `json:"policy"`
}

// MetaResult contains response metadata.
type MetaResult struct {
	Signals         int    `json:"signals"`
	SignalsPositive int    `json:"signals_positive"`
	Cached          bool   `json:"cached"`
	QueryMs         int    `json:"query_ms"`
	Version         string `json:"version"`
}


