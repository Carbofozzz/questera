# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
from dataclasses import dataclass
import json

genvm_eth = gl.evm

@allow_storage
@dataclass
class Quest:
    creator: Address
    contract: Address
    title: str
    desc: str
    image: str
    end_date: str
    pool: u256

    def to_dict(self):
        return {
            "creator": self.creator.as_hex,
            "contract": self.contract.as_hex,
            "title": self.title,
            "desc": self.desc,
            "image": self.image,
            "end_date": self.end_date,
            "pool": str(self.pool)
        }

class Quests(gl.Contract):
    admins: DynArray[Address]
    quests: TreeMap[Address, Quest]
    state: str

    def __init__(self):
        self.admins.append(gl.message.sender_address)
        self.admins.append(Address("0xb1d8d84c9e3a11d86103a51aa552Fa562B2b34c3"))
        self.state = "Empty"

    @gl.public.write
    def add_admin(self, admin_contract: str):
        self._only_admin()
        a = Address(admin_contract)
        self.admins.append(a)

    @gl.public.write
    def clear_admins(self):
        self._only_admin()
        self.admins.clear()
        self.admins.append(gl.message.sender_address)

    @gl.public.write
    def add_quest(
        self, 
        creator: str, 
        contract: str, 
        title: str, 
        desc: str, 
        image: str,
        end_date: int,
        pool: int
    ):
        self._only_admin()
        quest_contract = Address(contract)
        quest_creator = Address(creator)
        quest = Quest(
            creator = quest_creator,
            contract = quest_contract,
            title = title,
            desc = desc,
            image = image,
            end_date = str(end_date / 1000),
            pool = u256(pool)
        )
        self.quests[quest_contract] = quest

    @gl.public.view
    def get_quests_pool(self, limit: int) -> str:
        result = []
        for k, v in sorted(self.quests.items(), key=lambda kv: kv[1].pool, reverse=True)[:limit]:
            result.append(v.to_dict())
        return json.dumps(result)

    @gl.public.view
    def get_quests_date(self, limit: int) -> str:
        result = []
        for k, v in sorted(self.quests.items(), key=lambda kv: float(kv[1].end_date), reverse=True)[:limit]:
            result.append(v.to_dict())
        return json.dumps(result)

    @gl.public.view
    def get_my_quests(self, limit: int) -> str:
        result = []
        for k, v in sorted(self.quests.items(), key=lambda kv: kv[1].is_active, reverse=True)[:limit]:
            if v.creator == gl.message.sender_address:
                result.append(v.to_dict())
        return json.dumps(result)

    @gl.public.view
    def get_state(self) -> str:
        return self.state

    @gl.public.view
    def get_admins(self) -> str:
        result = []
        for a in self.admins:
            result.append(a.as_hex)
        return json.dumps(result)

    def _only_admin(self):
        if gl.message.sender_address not in self.admins:
            raise Exception("You are not an admin")