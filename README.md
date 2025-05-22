# Shakesco Stealth Addresses

> Special credit to [_umbra-cash_](https://app.umbra.cash/ "Umbra").

This package will allow you to perform private transactions where only the sender and receiver
know the destination of the transaction. To understand how it works: [**umbra-docs**](https://app.umbra.cash/faq#how-does-it-work-technical "Umbra"), [**EIP 5564**](https://eips.ethereum.org/EIPS/eip-5564 "EIP 5564")

_We assume that you have a single private key securing your wallet and that you are signing the same message hash. The former is not advised._

To get started:

```shell
npm i @shakesco/private
```

After installing:

```javascript
const shakesco = require("@shakesco/private");
const { KeyPair, RandomNumber, StealthKeyRegistry, utils } = shakesco;
const { IsUsersFunds, generateKeyPair, prepareSend } = shakesco;
```

We use the umbra registry to register stealth keys. To check if user has keys:

```javascript
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const registry = new StealthKeyRegistry(provider);

const { spendingPublicKey, viewingPublicKey } = await registry.getStealthKeys(
  recipientId
);
console.log(spendingPublicKey);
console.log(viewingPublicKey);
```

If an empty string is returned the user has not registered for private transactions. So you register them as follows:

1. If you want to set keys for a smart wallet:

```javascript
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const signer = new ethers.Wallet(process.env.PRIV_KEY, provider);
const signature = await signer.signMessage(messageHash);
const { spendingKeyPair, viewingKeyPair } = await generateKeyPair(signature);
console.log(viewingKeyPair.privateKeyHex); // storing this for the user is okay! To fetch transactions for them easily. You can also choose to not store it.
const registry = new StealthKeyRegistry(provider);

const { spendingPrefix, spendingPubKeyX, viewingPrefix, viewingPubKeyX } =
  await registry.setSmartStealthKeys(
    spendingKeyPair.publicKeyHex,
    viewingKeyPair.publicKeyHex
  );
```

> You can call the registry contract with the above details as the parameter.

2. If you want to set keys for EOAs:

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

Your user is now ready to perform private transactions. To prepare the payee to receive a private transaction:

```javascript
   const payee = //payee address
   const provider = //node provider eg: alchemy
   const { stealthKeyPair, pubKeyXCoordinate, encrypted } =
        await prepareSend(address, provider);
   console.log(stealthKeyPair.address);// address funds should be sent to. This is a stealth address that the payee can control.
   console.log(pubKeyXCoordinate); // Public key that the payee will use to decrypt the ciphertext hence proving funds belong to them
   console.log(encrypted.ciphertext);// Encrypted random number used to generate the stealth address.
```

> NOTE📓: You need to send the ciphertext and publickey to the payee. Otherwise they will not be able to prove ownership of funds. You can use tools like [**the graph**](https://thegraph.com/en/ "Graph") or [**moralis**](https://moralis.io/ "Moralis") to query the 'Announcement' from your private contract after a transaction has been initiated.

```solidity
  event Announcement (
      uint256 indexed schemeId,
      address indexed stealthAddress,
      address indexed caller,
      bytes ephemeralPubKey,
      bytes metadata
    );
```

To check if funds belong to a certain user:

```javascript
IsUsersFunds(object.announcements[i], provider, secret, sender).then((data) => {
  if (data.isForUser) {
    //belongs to user
    //perform any action you want with the data.
  }
});
```

If the funds belong to the user they can spend the funds. To create the private key that will be able to do this:

```javascript
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const signer = new ethers.Wallet(process.env.PRIV_KEY, provider);
const signature = await signer.signMessage(messageHash);
const { spendingKeyPair, viewingKeyPair } = await generateKeyPair(signature);

const payload = {
  ephemeralPublicKey: uncompressedPubKey,
  ciphertext: ciphertext,
};

const random = await viewkey.decrypt(payload);

const privkey = KeyPair.computeStealthPrivateKey(
  spendingKeyPair.privateKeyHex,
  random //decrypted random number
);

const wallet = new ethers.Wallet(privkey, provider);
const txResponse = await wallet.sendTransaction({
  value: ethers.parseEther(value),
  to: address,
});
const response = await txResponse.wait();
```

You have successfully sent a private transactions. We aim to help umbra expand the adoption of stealth payments. ZK will improve upon stealth addresses ensuring Ethereum is more private!
