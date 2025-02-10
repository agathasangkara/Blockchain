from eth_keys import keys
from eth_utils import keccak

def generate_signature(message: str, private_key_hex: str):
    private_key = keys.PrivateKey(bytes.fromhex(private_key_hex[2:]))
    return private_key.sign_msg_hash(keccak(f"\x19Ethereum Signed Message:\n{len(message)}".encode() + message.encode())).to_hex()
