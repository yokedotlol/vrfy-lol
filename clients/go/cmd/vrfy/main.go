// vrfy CLI — email validation from your terminal.
//
// Usage:
//
//	vrfy check user@example.com
//	vrfy check --batch emails.txt
//	vrfy check --json user@example.com
//	echo "user@example.com" | vrfy check -
package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/mattn/go-isatty"
	"github.com/spf13/cobra"
	vrfy "github.com/yokedotlol/vrfy"
)

var (
	version = "dev"
	commit  = "none"
)

var isTTY = isatty.IsTerminal(os.Stdout.Fd()) || isatty.IsCygwinTerminal(os.Stdout.Fd())

// Styles
var (
	actionAllow  = lipgloss.NewStyle().Foreground(lipgloss.Color("#38d9a9")).Bold(true)
	actionVerify = lipgloss.NewStyle().Foreground(lipgloss.Color("#ffd43b")).Bold(true)
	actionBlock  = lipgloss.NewStyle().Foreground(lipgloss.Color("#ff6b6b")).Bold(true)
	dimStyle     = lipgloss.NewStyle().Foreground(lipgloss.Color("#666"))
	boldStyle    = lipgloss.NewStyle().Bold(true)
	headerStyle  = lipgloss.NewStyle().Foreground(lipgloss.Color("#38d9a9")).Bold(true)
)

func main() {
	rootCmd := &cobra.Command{
		Use:     "vrfy",
		Short:   "Email validation — no SMTP probes, no API keys",
		Long:    "vrfy validates email addresses using DNS signals and passive existence checks.\nPart of the .lol family: https://vrfy.lol",
		Version: version,
	}

	var jsonOutput bool
	var batchFile string
	var quick bool
	var baseURL string

	checkCmd := &cobra.Command{
		Use:   "check <email> [email...]",
		Short: "Validate one or more email addresses",
		Long: `Validate email addresses against vrfy.lol.

Examples:
  vrfy check user@example.com
  vrfy check user@gmail.com admin@company.com
  vrfy check --batch emails.txt
  echo "user@example.com" | vrfy check -`,
		Args: cobra.MinimumNArgs(0),
		RunE: func(cmd *cobra.Command, args []string) error {
			client := vrfy.NewClient()
			if baseURL != "" {
				client.BaseURL = baseURL
			}

			var emails []string

			// Read from batch file
			if batchFile != "" {
				f, err := os.Open(batchFile)
				if err != nil {
					return fmt.Errorf("open batch file: %w", err)
				}
				defer f.Close()
				scanner := bufio.NewScanner(f)
				for scanner.Scan() {
					line := strings.TrimSpace(scanner.Text())
					if line != "" && !strings.HasPrefix(line, "#") {
						emails = append(emails, line)
					}
				}
				if err := scanner.Err(); err != nil {
					return fmt.Errorf("read batch file: %w", err)
				}
			}

			// Read from stdin if "-" arg
			if len(args) == 1 && args[0] == "-" {
				scanner := bufio.NewScanner(os.Stdin)
				for scanner.Scan() {
					line := strings.TrimSpace(scanner.Text())
					if line != "" && !strings.HasPrefix(line, "#") {
						emails = append(emails, line)
					}
				}
			} else {
				emails = append(emails, args...)
			}

			if len(emails) == 0 {
				return fmt.Errorf("no email addresses provided")
			}

			// Single email
			if len(emails) == 1 {
				opts := &vrfy.Options{Quick: quick}
				result, err := client.ValidateOpts(emails[0], opts)
				if err != nil {
					return err
				}
				if jsonOutput {
					return printJSON(result)
				}
				printResult(result)
				return exitForAction(result.Action)
			}

			// Batch — chunk into groups of 20
			var allResults []vrfy.Result
			for i := 0; i < len(emails); i += 20 {
				end := i + 20
				if end > len(emails) {
					end = len(emails)
				}
				chunk := emails[i:end]
				batch, err := client.ValidateBatch(chunk)
				if err != nil {
					return fmt.Errorf("batch %d-%d: %w", i+1, end, err)
				}
				allResults = append(allResults, batch.Results...)
			}

			if jsonOutput {
				return printJSON(allResults)
			}

			for i, r := range allResults {
				if i > 0 {
					fmt.Println()
				}
				printResult(&r)
			}

			// Exit 1 if any blocked
			for _, r := range allResults {
				if r.Action == "block" {
					os.Exit(1)
				}
			}
			return nil
		},
	}

	checkCmd.Flags().BoolVar(&jsonOutput, "json", false, "Output raw JSON")
	checkCmd.Flags().BoolVar(&quick, "quick", false, "Quick mode (Tier 1 signals only)")
	checkCmd.Flags().StringVar(&batchFile, "batch", "", "Read emails from file (one per line)")
	checkCmd.Flags().StringVar(&baseURL, "url", "", "Override API base URL")

	rootCmd.AddCommand(checkCmd)

	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}

func printJSON(v interface{}) error {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(v)
}

func printResult(r *vrfy.Result) {
	var actionStr string
	switch r.Action {
	case "allow":
		actionStr = actionAllow.Render("✓ allow")
	case "verify":
		actionStr = actionVerify.Render("⚠ verify")
	case "block":
		actionStr = actionBlock.Render("✗ block")
	default:
		actionStr = r.Action
	}

	if !isTTY {
		// Plain text for piping
		fmt.Printf("%s\t%s\t%s\n", r.Email, r.Action, r.Confidence)
		return
	}

	fmt.Printf("%s  %s\n", boldStyle.Render(r.Email), actionStr)
	fmt.Printf("  %s %s\n", dimStyle.Render("confidence:"), r.Confidence)

	v := r.Validation
	if v.Provider != nil {
		fmt.Printf("  %s %s\n", dimStyle.Render("provider:"), v.Provider.Name)
	}
	if v.Disposable {
		fmt.Printf("  %s\n", actionBlock.Render("⚠ disposable domain"))
	}
	if v.PrivacyRelay {
		svc := ""
		if v.PrivacyRelayService != nil {
			svc = " (" + *v.PrivacyRelayService + ")"
		}
		fmt.Printf("  %s%s\n", dimStyle.Render("privacy relay"), svc)
	}
	if v.HasTypo && v.TypoSuggestion != nil {
		fmt.Printf("  %s %s\n", actionVerify.Render("typo?"), *v.TypoSuggestion)
	}
	if v.FreeProvider {
		fmt.Printf("  %s\n", dimStyle.Render("free provider"))
	}
	if v.RoleAccount {
		fmt.Printf("  %s\n", dimStyle.Render("role account"))
	}
	if v.Subaddressed {
		tag := ""
		if v.SubaddressTag != nil {
			tag = "+" + *v.SubaddressTag
		}
		fmt.Printf("  %s %s\n", dimStyle.Render("subaddressed:"), tag)
	}

	if r.Security != nil {
		fmt.Printf("  %s %s\n", dimStyle.Render("security:"), headerStyle.Render(r.Security.Grade))
	}

	fmt.Printf("  %s %dms", dimStyle.Render("query:"), r.Meta.QueryMs)
	if r.Meta.Cached {
		fmt.Print(" (cached)")
	}
	fmt.Println()
}

func exitForAction(action string) error {
	if action == "block" {
		os.Exit(1)
	}
	if action == "verify" {
		os.Exit(2)
	}
	return nil
}
