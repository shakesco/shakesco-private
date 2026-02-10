# @shakesco/private

JavaScript SDK for building privacy-preserving Ethereum transfers using stealth addresses.

> Special credit to [Umbra Cash](https://app.umbra.cash/) for pioneering stealth payment infrastructure.

## What It Does

The `@shakesco/private` SDK lets you implement truly private crypto transactions. No one except the sender and receiver can link the payment to the recipient's known address.

**Learn more:**

- [How it works (technical)](https://app.umbra.cash/faq#how-does-it-work-technical)
- [EIP-5564 Standard](https://eips.ethereum.org/EIPS/eip-5564)
- [Full documentation](https://docs.shakesco.com/stealth-payments/)

## Installation

```bash
npm i @shakesco/private
```

## Quick Start

```javascript
const shakesco = require("@shakesco/private");
const { KeyPair, RandomNumber, StealthKeyRegistry, utils } = shakesco;
const { IsUsersFunds, generateKeyPair, prepareSend } = shakesco;
```

**Security Note:** This implementation assumes a single private key secures your wallet and that you're signing the same message hash.

## Basic Workflow

### 1. Check if User Has Stealth Keys

```javascript
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const registry = new StealthKeyRegistry(provider);

const { spendingPublicKey, viewingPublicKey } =
  await registry.getStealthKeys(recipientId);

if (!spendingPublicKey) {
  console.log("User needs to register stealth keys first");
}
```

### 2. Register Stealth Keys

**For Smart Wallets (ERC-4337):**

```javascript
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const signer = new ethers.Wallet(process.env.PRIV_KEY, provider);
const signature = await signer.signMessage(messageHash);

const { spendingKeyPair, viewingKeyPair } = await generateKeyPair(signature);
const registry = new StealthKeyRegistry(provider);

const { spendingPrefix, spendingPubKeyX, viewingPrefix, viewingPubKeyX } =
  await registry.setSmartStealthKeys(
    spendingKeyPair.publicKeyHex,
    viewingKeyPair.publicKeyHex
  );

// Use these values to call the registry contract via your smart wallet
```

**For EOAs (Regular Wallets):**

```javascript
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const { spendingKeyPair, viewingKeyPair } = await generateKeyPair(setupSig);
const registry = new StealthKeyRegistry(provider);

const { spendingPrefix, spendingPubKeyX, viewingPrefix, viewingPubKeyX } =
  await registry.SetEOAStealthKeys(
    spendingKeyPair.publicKeyHex,
    viewingKeyPair.publicKeyHex
  );
```

### 3. Generate Stealth Address

```javascript
const payee = "0x..."; // Recipient's address
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

const { stealthKeyPair, pubKeyXCoordinate, encrypted } = await prepareSend(
  payee,
  provider
);

console.log(stealthKeyPair.address); // Send funds HERE
console.log(pubKeyXCoordinate); // Share with recipient
console.log(encrypted.ciphertext); // Share with recipient
```

**Important:** You must share `pubKeyXCoordinate` and `encrypted.ciphertext` with the recipient so they can prove ownership and spend the funds.

### 4. Announce the Payment

Emit this event from your contract so recipients can discover their payments:

```solidity
event Announcement(
  address indexed receiver,
  uint256 amount,
  address indexed tokenAddress,
  bytes32 pkx,
  bytes32 ciphertext
);
```

Use indexing services like [The Graph](https://thegraph.com/) or [Moralis](https://moralis.io/) to help recipients scan for announcements efficiently.

### 5. Check if Funds Belong to User

```javascript
IsUsersFunds(announcement, provider, viewingPrivateKey, sender).then((data) => {
  if (data.isForUser) {
    console.log("Amount:", data.amount);
    console.log("Token:", data.tokenAddress);
    console.log("Stealth address:", data.stealthAddress);
  }
});
```

### 6. Spend Private Funds

```javascript
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const signer = new ethers.Wallet(process.env.PRIV_KEY, provider);
const signature = await signer.signMessage(messageHash);

const { spendingKeyPair, viewingKeyPair } = await generateKeyPair(signature);

const payload = {
  ephemeralPublicKey: uncompressedPubKey,
  ciphertext: ciphertext,
};

const random = await viewingKeyPair.decrypt(payload);

const stealthPrivateKey = KeyPair.computeStealthPrivateKey(
  spendingKeyPair.privateKeyHex,
  random
);

const wallet = new ethers.Wallet(stealthPrivateKey, provider);
const txResponse = await wallet.sendTransaction({
  value: ethers.parseEther(value),
  to: destinationAddress,
});

await txResponse.wait();
console.log("Private funds successfully transferred!");
```

## Documentation

For complete integration guides and examples, visit: [docs.shakesco.com/stealth-payments](https://docs.shakesco.com/stealth-payments/)

## About Stealth Addresses

**What are spending and viewing keys?**

- **Spending Keys** - Used to generate stealth addresses and spend from them
- **Viewing Keys** - Allow scanning for incoming transactions without spending ability

This separation means you can monitor for payments without risking your funds.

**Note:** Storing `viewingKeyPair.privateKeyHex` for users is acceptable - it only enables transaction scanning, not spending.

## Resources

- [Umbra Protocol Docs](https://app.umbra.cash/faq)
- [EIP-5564 Discussion](https://ethereum-magicians.org/t/eip-5564-stealth-addresses/10614)
- [GitHub Repository](https://github.com/shakesco/shakesco-private)

## Future

While stealth addresses provide strong privacy today, zero-knowledge proofs will eventually offer even better solutions. Until then, stealth payments are the best way to bring privacy to Ethereum transactions.

We aim to help expand the adoption of stealth payments and make Ethereum more private!
