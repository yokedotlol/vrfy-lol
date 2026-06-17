package vrfy

import (
	"crypto/sha256"
	"strconv"
	"testing"
)

func TestCountLeadingZeroBits(t *testing.T) {
	tests := []struct {
		hash     []byte
		expected int
	}{
		{[]byte{0x00, 0x00, 0x01}, 23},
		{[]byte{0x00, 0x80}, 8},
		{[]byte{0x80}, 0},
		{[]byte{0x40}, 1},
		{[]byte{0x20}, 2},
		{[]byte{0x01}, 7},
		{[]byte{0x00, 0x00, 0x00}, 24},
	}
	for _, tt := range tests {
		got := countLeadingZeroBits(tt.hash)
		if got != tt.expected {
			t.Errorf("countLeadingZeroBits(%x) = %d, want %d", tt.hash, got, tt.expected)
		}
	}
}

func TestSolvePoW(t *testing.T) {
	// Use a low difficulty so the test is fast
	challenge := "deadbeef01234567890abcdef01234567890abcdef01234567890abcdef012345"
	difficulty := 8

	nonce, err := solvePoW(challenge, difficulty)
	if err != nil {
		t.Fatalf("solvePoW failed: %v", err)
	}

	// Verify the solution
	input := challenge + ":" + strconv.FormatUint(nonce, 10)
	hash := sha256.Sum256([]byte(input))
	bits := countLeadingZeroBits(hash[:])
	if bits < difficulty {
		t.Errorf("solution nonce %d only has %d leading zero bits, need %d", nonce, bits, difficulty)
	}
}

func TestClz8(t *testing.T) {
	tests := []struct {
		b    byte
		want uint8
	}{
		{0x00, 8},
		{0x80, 0},
		{0x40, 1},
		{0x20, 2},
		{0x10, 3},
		{0x08, 4},
		{0x04, 5},
		{0x02, 6},
		{0x01, 7},
		{0xFF, 0},
		{0x0F, 4},
	}
	for _, tt := range tests {
		got := clz8(tt.b)
		if got != tt.want {
			t.Errorf("clz8(0x%02x) = %d, want %d", tt.b, got, tt.want)
		}
	}
}
