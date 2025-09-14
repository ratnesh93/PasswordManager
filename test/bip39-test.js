import BIP39_WORDS from '../src/crypto/bip39-words.js';

console.log('BIP39 word count:', BIP39_WORDS.length);
console.log('First 10 words:', BIP39_WORDS.slice(0, 10));
console.log('Last 10 words:', BIP39_WORDS.slice(-10));

// Verify it's exactly 2048 words
if (BIP39_WORDS.length === 2048) {
  console.log('✅ Correct BIP39 word count: 2048 words');
} else {
  console.log('❌ Incorrect word count. Expected 2048, got:', BIP39_WORDS.length);
}

// Check for duplicates
const uniqueWords = new Set(BIP39_WORDS);
if (uniqueWords.size === BIP39_WORDS.length) {
  console.log('✅ No duplicate words found');
} else {
  console.log('❌ Duplicate words found. Unique count:', uniqueWords.size);
  
  // Find duplicates
  const wordCounts = {};
  BIP39_WORDS.forEach(word => {
    wordCounts[word] = (wordCounts[word] || 0) + 1;
  });
  
  console.log('Duplicate words:');
  Object.entries(wordCounts)
    .filter(([word, count]) => count > 1)
    .forEach(([word, count]) => console.log(`  ${word}: ${count} times`));
}