# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from genlayer import *
from genlayer.py.keccak import Keccak256

genvm_eth = gl.evm

@allow_storage
@dataclass
class MessageData:
    target_chain_id: u256
    target_contract: str
    data: bytes

class BridgeSender(gl.Contract):
    owner: Address
    admins: TreeMap[str, bool]
    messages: TreeMap[str, MessageData]

    def __init__(self):
        self.owner = gl.message.sender_address
        self.set_admin(gl.message.sender_address.as_hex, True)
        self.set_admin("0xb1d8d84c9e3a11d86103a51aa552Fa562B2b34c3", True)

    # Admin

    @gl.public.write
    def transfer_ownership(self, new_owner: str):
        self._only_owner()
        self.set_admin(self.owner.as_hex, False)
        self.owner = Address(new_owner)
        self.set_admin(new_owner, True)

    @gl.public.write
    def set_admin(self, relayer_address: str, authorized: bool):
        self._only_owner()
        self.admins[relayer_address.lower()] = authorized

    # Message Sending (called by IC)

    @gl.public.write
    def send_message(self, target_chain_id: int, target_contract: str, data: bytes) -> str:
        #self._only_admin()

        hasher = Keccak256()
        hasher.update(datetime.now().isoformat().encode())
        hasher.update(gl.message.sender_address.as_bytes)
        hasher.update(target_contract.encode())
        hasher.update(data)

        message_hash = hasher.digest().hex()

        abi = [u32, Address, Address, bytes]
        encoder = genvm_eth.MethodEncoder("", abi, bool)
        message_data = [61998, gl.message.sender_address, Address(target_contract), data]
        message_bytes = encoder.encode_call(message_data)[4:]  # Remove method selector

        self.messages[message_hash] = MessageData(target_chain_id, target_contract, message_bytes)
        return message_hash

    @gl.public.view
    def get_message(self, message_hash: str) -> dict[str, Any]:
        self._only_admin()
        return self.messages.get(message_hash, {})

    @gl.public.view
    def get_messages(self) -> dict[str, dict[str, Any]]:
        self._only_admin()
        return self.messages

    @gl.public.view
    def get_message_hashes(self) -> list[str]:
        self._only_admin()
        return list(self.messages.keys())

    @gl.public.view
    def is_sender_authorized(self, relayer: str) -> bool:
        self._only_admin()
        return self.admins.get(relayer.lower(), False)

    @gl.public.view
    def get_owner(self) -> str:
        return str(self.owner)

    def _only_owner(self):
        if gl.message.sender_address != self.owner:
            raise Exception("You are not the owner")

    def _only_admin(self):
        caller = str(gl.message.sender_address).lower()
        if not self.admins.get(caller, False):
            raise ValueError(f"Unauthorized sender: {caller}")