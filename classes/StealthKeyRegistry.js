const KeyPair = require("../classes/KeyPair");
const { Contract } = require("ethers");

const abi = [
  'event StealthKeyChanged(address indexed registrant, uint256 spendingPubKeyPrefix, uint256 spendingPubKey, uint256 viewingPubKeyPrefix, uint256 viewingPubKey)',
  'function setStealthKeys(uint256 spendingPubKeyPrefix, uint256 spendingPubKey, uint256 viewingPubKeyPrefix, uint256 viewingPubKey)',
  'function setStealthKeysOnBehalf(address registrant, uint256 spendingPubKeyPrefix, uint256 spendingPubKey, uint256 viewingPubKeyPrefix, uint256 viewingPubKey, uint8 v, bytes32 r, bytes32 s)',
  'function stealthKeys(address registrant) view returns (uint256 spendingPubKeyPrefix, uint256 spendingPubKey, uint256 viewingPubKeyPrefix, uint256 viewingPubKey)',
]; //prettier-ignore

class StealthKeyRegistry {
  /**
   * @notice Create StealthKeyRegistry instance to interact with the registry
   * @param signerOrProvider signer or provider to use
   */
  constructor(signerOrProvider) {
    signerOrProvider.getNetwork().then((network) => {
      const stealthKeyRegistry =
        network.id.toString() == "80001"
          ? "0x9c2608361246B598d9587723bDBD3D5458eaE1C4"
          : "0x31fe56609C65Cd0C510E7125f051D440424D38f3";
      this._registry = new Contract(stealthKeyRegistry, abi, signerOrProvider);
    });
  }

  /**
   * @dev Checks if user has registered for stealth payments. If not they cannot proceed.
   * @notice For a given account, recovers and returns the public keys
   * @param account Address to get public keys for
   */
  async getStealthKeys(account) {
    // Read stealth keys from the resolver contract
    const keys = await this._registry.stealthKeys(account);
    const {
      spendingPubKeyPrefix,
      spendingPubKey,
      viewingPubKeyPrefix,
      viewingPubKey,
    } = keys;

    // Throw if no stealth keys are set
    if (
      spendingPubKeyPrefix == 0 ||
      spendingPubKey == 0 ||
      viewingPubKeyPrefix == 0 ||
      viewingPubKey == 0
    ) {
      throw new Error(`Address ${account} has not registered stealth keys. Please ask them to setup their an account`); // prettier-ignore
    }

    // Decompress keys and return them
    const spendingPublicKey = KeyPair.getUncompressedFromX(
      spendingPubKey,
      Number(spendingPubKeyPrefix)
    );
    const viewingPublicKey = KeyPair.getUncompressedFromX(
      viewingPubKey,
      Number(viewingPubKeyPrefix)
    );
    return { spendingPublicKey, viewingPublicKey };
  }

  /**
   * @notice Set stealth keys.
   * @dev Use this if you users have smart wallets.
   * @dev Get the returned values and create a userop/calldata from the values to the umbra registry or your registry.
   * @param spendingPublicKey The public key for generating a stealth address as hex string
   * @param viewingPublicKey The public key to use for encryption as hex string
   * @returns The addresses to register to the stealth registry
   */
  async setSmartStealthKeys(spendingPublicKey, viewingPublicKey) {
    // Break public keys into the required components to store compressed public keys
    const { prefix: spendingPrefix, pubKeyXCoordinate: spendingPubKeyX } =
      KeyPair.compressPublicKey(spendingPublicKey);
    const { prefix: viewingPrefix, pubKeyXCoordinate: viewingPubKeyX } =
      KeyPair.compressPublicKey(viewingPublicKey);

    return { spendingPrefix, spendingPubKeyX, viewingPrefix, viewingPubKeyX };
  }

  /**
   * @notice Set stealth keys.
   * @dev Use this if you users have external owned wallets.
   * @dev When they call the below function it will set or update the umbra registry and they can start sending private transactions!
   * @param spendingPublicKey The public key for generating a stealth address as hex string
   * @param viewingPublicKey The public key to use for encryption as hex string
   * @returns Transaction
   */

  async SetEOAStealthKeys(spendingPublicKey, viewingPublicKey, signer) {
    // Get instance of StealthKeyRegistry contract
    const registry = signer ? this._registry.connect(signer) : this._registry;

    // Break public keys into the required components to store compressed public keys
    const { prefix: spendingPrefix, pubKeyXCoordinate: spendingPubKeyX } =
      KeyPair.compressPublicKey(spendingPublicKey);
    const { prefix: viewingPrefix, pubKeyXCoordinate: viewingPubKeyX } =
      KeyPair.compressPublicKey(viewingPublicKey);

    // Send transaction to set the keys
    return registry.setStealthKeys(
      spendingPrefix,
      spendingPubKeyX,
      viewingPrefix,
      viewingPubKeyX
    );
  }
}

module.exports = StealthKeyRegistry;
