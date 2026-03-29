# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
from dataclasses import dataclass
from datetime import datetime, timezone
import json

genvm_eth = gl.evm

@allow_storage
@dataclass
class State:
    world_snapshot: str
    last_task_summary: str
    last_narration: str
    last_comment: str
    last_progress: u256
    is_completed: bool

    def to_dict(self, address: str):
        return {
            "world_snapshot": self.world_snapshot, 
            "last_task_summary": self.last_task_summary, 
            "last_narration": self.last_narration, 
            "last_comment": self.last_comment, 
            "last_progress": str(self.last_progress), 
            "is_completed": str(self.is_completed), 
            "address": address
        }

class Quest(gl.Contract):
    relayer: Address
    quests: Address
    bridge_in: Address
    bridge_out: Address
    creator: Address
    escrow: str
    title: str
    desc: str
    image: str
    end_date: str
    pool: u256
    prompt_desc: str
    is_active: bool
    states: TreeMap[Address, State]
    log_message: str
    log_message_b: str

    def __init__(
        self, 
        relayer_value: str, 
        quests_value: str, 
        bridge_in_value: str, 
        bridge_out_value: str, 
        creator_value: str, 
        escrow_value: str, 
        title_value: str, 
        desc_value: str, 
        image_value: str, 
        prompt: str, 
        end_date_value: int, 
        pool_value: int
    ):
        self.relayer = Address(relayer_value)
        self.quests = Address(quests_value)
        self.bridge_in = Address(bridge_in_value)
        self.bridge_out = Address(bridge_out_value)
        self.creator = Address(creator_value)
        self.escrow = escrow_value
        self.title = title_value
        self.desc = desc_value
        self.image = image_value
        self.prompt_desc = prompt
        self.end_date = str(end_date_value / 1000)
        self.pool = u256(pool_value)
        self.is_active = False
        self.log_message = "Nothing"
        self.log_message_b = "Nothing more"

    @gl.public.write
    def activate(self, source_sender: str):
        self._only_relayer()
        if self.creator.as_hex.lower() == source_sender.lower():
            self.is_active = True
            self.log_message = "Activated by relayer"

    @gl.public.write
    def process_bridge_message(self, message_id: str, source_chain_id: int, source_sender: str, message: bytes):
        self._only_bridge()
        if self.creator.as_hex.lower() == source_sender.lower():
            self.is_active = True
            self.log_message_b = "Activated by bridge"
            quests_contract = gl.get_contract_at(self.quests)
            quests_contract.emit().add_quest(
                self.creator.as_hex,
                self.title,
                self.desc,
                self.image,
                int(float(self.end_date)) * 1000,
                int(self.pool)
            )

    @gl.public.write
    def start(self):
        sender_address = gl.message.sender_address
        state = self.states.get(sender_address, None)
        time_str = gl.message_raw["datetime"]
        if _check_time_due(self.end_date, time_str):
            raise Exception("The quest has been already ended")
        if not self.is_active:
            raise Exception("The quest hasn't been activated yet")
        if state is not None:
            raise Exception("The quest has been already started")
        self.states[sender_address] = State(
            world_snapshot = "",
            last_task_summary = "",
            last_narration = "",
            last_comment = "",
            last_progress = 0,
            is_completed = False
        )
        self.answer("")

    @gl.public.write
    def answer(self, answer_text: str):
        sender_address = gl.message.sender_address
        state = self.states.get(sender_address, None)
        time_str = gl.message_raw["datetime"]
        if _check_time_due(self.end_date, time_str):
            raise Exception("The quest has been already ended")
        if not self.is_active:
            raise Exception("The quest hasn't been activated yet")
        if state is None:
            raise Exception("The quest hasn't been started yet")
        if not answer_text.strip() and state.last_task_summary.strip():
            raise Exception("Your answer is empty")
        if state.is_completed:
            raise Exception("The quest has already completed")
        quest_level = state.last_progress
        world_snapshot = state.world_snapshot
        last_task_summary = state.last_task_summary
        desc = self.prompt_desc

        def leader_fn():
            task = f"""
You are a deterministic game master for a branching text quest.

INPUT
- world_snapshot: {world_snapshot}
- last_task_summary: {last_task_summary}
- answer_text: {answer_text}
- quest_level: {quest_level}
- genre_anchor: {desc}

GOAL
Return exactly one JSON object with:
1) answer evaluation,
2) progress_delta (-1/0/+1) computed by strict rules,
3) story continuation,
4) next task (unless quest completed),
5) updated state (world_snapshot + last_task_summary),
6) quest_completed flag.

CORE RULES

A) GENRE & CONSISTENCY
- genre_anchor ({desc}) is highest priority for setting/tone/conflict type.
- Keep continuity with provided world_snapshot and last_task_summary.
- Do not introduce incompatible lore jumps.

B) FIRST TURN
If world_snapshot and last_task_summary are empty/missing:
- Create intro scene + first task.
- Set:
  goal_relevance=0,
  actionability=0,
  contradiction_to_task=0,
  explicit_refusal_or_gibberish=0,
  progress_delta=0.

C) BINARY SCORING (0/1 only)
- goal_relevance: 1 iff answer_text directly addresses previous task objective; else 0.
- actionability: 1 iff answer_text includes at least one concrete action/decision; else 0.
- contradiction_to_task: 1 iff answer_text opposes/derails previous task objective; else 0.
- explicit_refusal_or_gibberish: 1 iff empty/meaningless/refusal/off-topic; else 0.

D) PROGRESS DELTA (STRICT ORDER)
1. if explicit_refusal_or_gibberish == 1 -> progress_delta = -1
2. else if goal_relevance == 1 and actionability == 1 and contradiction_to_task == 0 -> progress_delta = +1
3. else if goal_relevance == 0 or contradiction_to_task == 1 -> progress_delta = -1
4. else -> progress_delta = 0

Tie-break:
- if uncertain between 1 and 0 -> choose 0
- if uncertain between 0 and -1 -> choose -1

E) QUEST COMPLETION
- If incoming quest_level == 3 and progress_delta == +1:
  quest_completed = true
  narration must be an ending scene (resolution + short epilogue)
  do NOT create a new task
  last_task_summary = completion summary (1-3 sentences)
  world_snapshot = post-ending state (2-5 sentences)
- Otherwise:
  quest_completed = false
  narration ends with a clear direct task for player
  last_task_summary summarizes that next task (1-3 sentences)

F) STYLE
- Third-person narration; NPC dialogue allowed.
- Keep concise and causal; avoid repetition.

OUTPUT (STRICT)
Return ONLY valid JSON, no extra text, no markdown.

{{
  "goal_relevance": int,
  "actionability": int,
  "contradiction_to_task": int,
  "explicit_refusal_or_gibberish": int,
  "progress_delta": int,
  "quest_completed": bool,
  "comment": str,
  "narration": str,
  "last_task_summary": str,
  "world_snapshot": str
}}
It is mandatory that you respond only using the JSON format above,
nothing else. Don't include any other words or characters,
your output must be only JSON without any formatting prefix or suffix.
This result should be perfectly parsable by a JSON parser without errors.
            """
            result = gl.nondet.exec_prompt(task)
            return json.loads(_extract_json_from_string(result))
        def validator_fn(
            leader_score: gl.vm.Result,
        ) -> bool:
            if not isinstance(leader_score, gl.vm.Return):
                return False
            leader_res = leader_score.calldata
            validator_res = leader_fn()
            leader_progress = leader_res["progress_delta"]
            validator_progress = validator_res["progress_delta"]
            return leader_progress == validator_progress

        result_ai = gl.vm.run_nondet(leader_fn, validator_fn)
        state.world_snapshot = result_ai["world_snapshot"]
        state.last_task_summary = result_ai["last_task_summary"]
        state.last_narration = result_ai["narration"]
        state.last_comment = result_ai["comment"]
        if state.last_progress > 0:
            state.last_progress += int(result_ai["progress_delta"])
        if state.last_progress == 0 and int(result_ai["progress_delta"]) >= 0:
            state.last_progress = int(result_ai["progress_delta"])
        state.is_completed = result_ai["quest_completed"]

        if result_ai["quest_completed"]:
            message = json.dumps({ "address": sender_address.as_hex, "action": "completed" })
            abi = [str]
            encoder = genvm_eth.MethodEncoder("", abi, bool)
            message_bytes = encoder.encode_call([message])[4:]
            bridge_contract = gl.get_contract_at(self.bridge_out)
            bridge_contract.emit().send_message(40245, self.escrow, message_bytes)

        if not answer_text.strip():
            quests_contract = gl.get_contract_at(self.quests)
            quests_contract.emit().add_quest_user(
                self.creator.as_hex,
                sender_address.as_hex,
                self.title,
                int(float(self.end_date)) * 1000
            )


    @gl.public.view
    def get_my_quest(self) -> str:
        try:
            sender_address = gl.message.sender_address
            state = self.states.get(sender_address, None)
            if state is None:
                return json.dumps({
                "creator": self.creator.as_hex,
                "escrow": self.escrow,
                "title": self.title,
                "desc": self.desc,
                "image": self.image,
                "end_date": self.end_date,
                "pool": str(self.pool),
                "is_active": str(self.is_active)
            })
            return json.dumps({
                "creator": self.creator.as_hex,
                "escrow": self.escrow,
                "title": self.title,
                "desc": self.desc,
                "image": self.image,
                "end_date": self.end_date,
                "pool": str(self.pool),
                "is_active": str(self.is_active),
                "state": state.to_dict(sender_address.as_hex)
            })
        except Exception as e:
            return json.dumps({ "error": str(e) })

    @gl.public.view
    def get_log(self) -> str:
        return self.log_message + ", " + self.log_message_b

    def _only_bridge(self):
        if gl.message.sender_address != self.bridge_in:
            raise Exception("You are not the bridge")

    def _only_relayer(self):
        if gl.message.sender_address != self.relayer:
            raise Exception("You are not the relayer")

def _convert_time(time_str: str) -> int:
    formats = (
        "%Y-%m-%dT%H:%M:%S.%fZ", 
        "%Y-%m-%dT%H:%M:%SZ",
    )
    for fmt in formats:
        try:
            dt = datetime.strptime(time_str, fmt).replace(tzinfo=timezone.utc)
            return int(dt.timestamp())
        except ValueError:
            pass
    raise ValueError(f"Unsupported datetime format: {time_str}")

def _check_time_due(time_quest: str, time_str: str) -> bool:
    return _convert_time(time_str) > int(float(time_quest))

def _extract_json_from_string(s: str) -> str:
    """
    Extract a JSON object from a string.

    Args:
        s (str): The string potentially containing a JSON object.

    Returns:
        str: The extracted JSON string, or an empty string if no valid JSON is found.
    """
    start_index = s.find("{")
    end_index = s.rfind("}")
    if start_index != -1 and end_index != -1 and start_index < end_index:
        return s[start_index : end_index + 1]
    else:
        return ""