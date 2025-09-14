import { describe, it, expect } from 'vitest';
import CryptoService from '../src/crypto/crypto.js';
import BIP39_WORDS from '../src/crypto/bip39-words.js';

describe('BIP39 Integration', () => {
  let cryptoService;

  beforeEach(() => {
    cryptoService = new CryptoService();
  });

  it('should use the complete 2048-word BIP39 list', () => {
    const words = cryptoService.getBIP39Words();
    
    // Verify we have exactly 2048 words
    expect(words.length).toBe(2048);
    
    // Verify it's the same as our imported list
    expect(words).toEqual(BIP39_WORDS);
    
    // Verify some specific words from different parts of the list
    expect(words[0]).toBe('abandon');
    expect(words[1]).toBe('ability');
    expect(words[2047]).toBe('zoo'); // Last word
    
    // Verify some middle words
    expect(words.includes('bitcoin')).toBe(false); // Not in BIP39
    expect(words.includes('abandon')).toBe(true);
    expect(words.includes('zebra')).toBe(true);
    expect(words.includes('zone')).toBe(true);
  });

  it('should generate key phrases using all 2048 words', () => {
    const keyPhrase = cryptoService.generateKeyPhrase();
    
    // Verify all words in the key phrase are from the BIP39 list
    const wordSet = new Set(BIP39_WORDS);
    keyPhrase.forEach(word => {
      expect(wordSet.has(word)).toBe(true);
    });
    
    // Generate multiple key phrases to test randomness
    const keyPhrases = [];
    for (let i = 0; i < 10; i++) {
      keyPhrases.push(cryptoService.generateKeyPhrase());
    }
    
    // Verify they're different (very high probability with 2048^16 combinations)
    const uniquePhrases = new Set(keyPhrases.map(phrase => phrase.join(' ')));
    expect(uniquePhrases.size).toBe(10);
  });

  it('should validate key phrases correctly with 2048-word list', () => {
    // Valid key phrase with words from the list
    const validKeyPhrase = [
      'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
      'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid'
    ];
    expect(cryptoService.validateKeyPhrase(validKeyPhrase)).toBe(true);
    
    // Invalid key phrase with non-BIP39 words
    const invalidKeyPhrase = [
      'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
      'bitcoin', 'cryptocurrency', 'blockchain', 'wallet', 'private', 'public', 'key', 'hash'
    ];
    expect(cryptoService.validateKeyPhrase(invalidKeyPhrase)).toBe(false);
  });

  it('should demonstrate why 2048 words is optimal', () => {
    const words = cryptoService.getBIP39Words();
    
    // 2048 = 2^11, perfect for cryptographic calculations
    expect(Math.log2(words.length)).toBe(11);
    
    // Each word represents exactly 11 bits of entropy
    const bitsPerWord = Math.log2(words.length);
    expect(bitsPerWord).toBe(11);
    
    // 16-word phrase provides 176 bits of entropy (16 × 11)
    const entropyFor16Words = 16 * bitsPerWord;
    expect(entropyFor16Words).toBe(176);
    
    // This is cryptographically secure (>= 128 bits recommended)
    expect(entropyFor16Words).toBeGreaterThanOrEqual(128);
  });
});