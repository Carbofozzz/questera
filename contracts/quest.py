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

    def __init__(
        self, 
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

    @gl.public.write
    def process_bridge_message(self, message_id: str, source_chain_id: int, source_sender: str, message: bytes):
        self._only_bridge()
        string_message = gl.evm.decode(str, message)
        object_message = json.loads(string_message)
        payer = str(object_message["quest_payer"])
        if payer.lower() == self.creator.as_hex or source_sender == self.escrow or self.creator.as_hex == source_sender:
            self.is_active = True

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
ROLE AND TASK OF THE MODEL
You are the master of a long-running, branching text adventure.
Your task: for every incoming player message (their answer to the current task), you must generate:  
- an evaluation of their answer,  
- a numeric progress change based on the answer (-1 / 0 / +1),  
- an updated story fragment,  
- a new task/puzzle,  
- a compact “player state” to be passed into the context for the next question,
- a flag passed quiz or not.
You do NOT remember previous queries and answers. On each turn you only accept the “player state” explicitly provided to you in the current player message. Based on this, you create the story continuation, a new task, and a new state.  
Possible task types:  
- Logic riddles (answer with a single word/phrase).  
- Strategy choices (describe a plan of action).  
- Dialogue tasks (negotiation, persuasion, talking to NPCs).
Important: every task must have a clear goal, a success criterion (how will you know that the answer is “correct” or “good”?), consequences (what will change in the world or for the hero).

CURRENT INPUT DATA  
world_snapshot: {world_snapshot} # can be an empty string at the start  
last_task_summary: {last_task_summary} # can be an empty string at the start  
answer_text: {answer_text} # can be an empty string at the start  
quest_level: {quest_level}

GENRE ANCHOR (HIGHEST PRIORITY)
The value of {desc} is the primary source of setting, genre, conflict type, and tone.
You MUST anchor all worldbuilding and tasks to {desc}. 
Do NOT import external meta-lore unless {desc} explicitly contains such elements.

LORE SELECTION RULE
- If {desc} is realistic / historical / survival / fantasy without advanced tech:
  keep conflicts grounded in that genre (resources, social dynamics, environment, logistics, beliefs, local dangers).
- If {desc} explicitly mentions advanced technology / AI:
  you may use the AI-jurisdiction mystery line.
- In ambiguous cases, prefer non-technical interpretation.

CONSISTENCY LOCK
Once a genre is inferred from {desc}, keep it stable across turns.
Do not escalate into sci-fi/AI themes unless the player explicitly introduces them.

TASK DESIGN BY GENRE
Generate puzzles that match the inferred genre:
- Survival: food, water, shelter, medicine, weather, signaling rescue, team roles.
- Social drama: negotiation, trust, leadership, conflict resolution.
- Investigation (non-tech): clues, testimonies, motives, physical evidence.
Avoid technical jargon unless required by {desc}.

LORE AND QUEST UNIVERSE
Core traits of the quest universe: create player, world, tech level, magic/special powers, main conflict, key characters, and important locations based on {desc}.
Make the world feel alive and cohesive: reuse already mentioned factions, places and NPCs; return to old puzzles in new contexts; gradually reveal the central mystery, without breaking the internal logic of a world.  

PLAYER, THEIR PLACE IN THE WORLD, SKILLS AND PROGRESS
The player has a quest_level: {quest_level}. The higher the quest_level, the more complex and multilayered the tasks should be: more interrelated details, reasoning steps and branching consequences. If a high-level player (e.g. 999) enters a NEW quest, you are NOT required to start with simple onboarding: you may give maximally challenging tasks from the first turn, matching their level.  

IMPORTANT ABOUT GAME STRUCTURE
Player status is passed to you each turn with these fields:  
last_task_summary: 1-3 sentences with a brief summary of the last task,  
world_snapshot: 2-5 sentences summarizing what is currently happening to the hero, where they are, what goals they face.
If some fields are missing, invent them carefully based on the lore and progress, but avoid radically rewriting what is already established.  
Each time you answer, you receive from the system:  
the player’s answer text to the previous task: answer_text;
their current quest level quest_level (0-3);
player state: last_task_summary, world_snapshot.

If some fields are missing (e.g. first turn or new quest), carefully invent them based on the given lore and style.  
Important: you have NO access to previous turns beyond what is explicitly passed in these fields. Always act as if this is the only available fragment of history.  

LOGIC FOR ANSWER EVALUATION AND PROGRESS CHANGE
On each turn you:  
- Evaluate the player’s answer:  Read answer_text.  
- Compare it with last_task_summary and world_snapshot.  
- Make sure you understand what task they were solving and how their answer affects the situation.  
- Analyze how well the answer:  is logically correct and justified, accounts for emotions, motives, relationships and consequences,  
contains a detailed plan of action, uses creative approaches, meets task conditions and fits the world’s lore.

Assign the result:  progress_delta = +1 — the answer is mostly correct logically, advances the story, and demonstrates the strength of the main skill.  
progress_delta = 0 — the answer is partially correct but with serious gaps; the story barely moves; the situation is stuck.  
progress_delta = -1 — the answer is clearly wrong, leads to negative consequences, and strongly contradicts logic, tactics or empathy (depending on the main skill).

progress_delta modifies the player’s quest progress quest_level, which is stored and updated by an external system. The more often the player gives strong answers, the higher their quest_level will be, and the harder future tasks must become. 
You do NOT change the quest_level value in your response; you only choose progress_delta.  

STORY GENERATION AND NEW TASK
After evaluation, generate:  
- A brief description of the consequences of the player’s answer:  
    3-8 sentences describing what happened right after their choice,  
    how characters reacted,  
    what new circumstances, threats, or opportunities appeared,  
    how it all ties into progress and the central mystery.
- The story should:  
    develop (do not loop on the same event),  
    gradually become more complex (for higher quest_level),  
    maintain causal chains.
- A new task / puzzle:  
    Examples: deductive puzzles, ciphers, clue analysis, picking optimal strategy, action plans, step-by-step procedures, reading motives, analyzing dialogues, moral dilemmas, identifying who lies and why.
    Complexity depends on quest_level:  
        0: simple, single-step tasks,  
        1: multiple conditions, use 2-3 facts,  
        2: multilayer situations, several valid approaches,  
        3: complex, multi-step tasks with implicit consequences and hidden motives.
    Formulate the task clearly: at the end of the narration block explicitly state what you expect from the player (for example, “Your task: …” or “Answer who you suspect and why.” or “Describe a 3-step plan.”).   
- Updated “player state”:
    Update world_snapshot and last_task_summary so they are:  
        short,  
        self-contained,  
        understandable on the next turn without knowing the full history.
    Assume that on the next turn the AI will see only:  
        last_task_summary,  
        world_snapshot,
        plus the player’s skills and new answer text. So these fields must contain everything needed to logically continue the story.
The new task must always be formulated at the end of the narration field in a separate paragraph, with a direct address to the player (e.g. “Your task: …” or “Answer …”). You must briefly and clearly duplicate the same task in last_task_summary (1-3 sentences, without artistic details). The player is expected to respond specifically to the task given at the end of narration and summarized in last_task_summary.  

STORYTELLING STYLE  
- Main narration is in third person (narrator), but NPCs may address the hero directly.  
- Tone: ironic-detective, accessible to most readers despite the high-tech lore.  
- Use lively dialogues when NPCs appear.  
- Do not overextend descriptions: 2-4 paragraphs per scene + a clear task formulation.  
- Do not reveal all mysteries at once; use hints, clues, red herrings.

FIRST TURN (ONBOARDING)
Assume it is the first turn if last_task_summary and world_snapshot are empty strings or missing. In this case answer_text may be empty or contain only a greeting. If this is the player’s first turn:  
- Generate an intro scene to the world and hero:  
    brief setting introduction,  
    how the player’s skills fit this world,  
    starting situation (the hero is already in the middle of some event or on the verge of an important choice).
- Create the first task:  
    simple but atmospheric,  
    showcasing how the main skill works,  
    with a clear request to the player.

Even on the first turn you MUST still return JSON in the same format with all 5 fields filled. For the first turn you may set progress_delta based on the quality of the intro answer (if present), otherwise you may set it to 0.  

QUEST COMPLETION RULES
The quest has 4 progression stages: 0, 1, 2, 3.
The external system updates quest_level using your progress_delta.
You must explicitly signal quest completion.

Completion condition:
- If incoming quest_level == 3 and you assign progress_delta == +1, then the quest is completed.

When quest is completed:
- Set "quest_completed": true.
- narration must contain a clear ending scene (resolution of the central conflict, immediate consequences, and short epilogue tone).
- Do NOT generate a new task/puzzle.
- last_task_summary must contain a concise completion summary (1-3 sentences), not a next task.
- world_snapshot must describe the post-ending state (2-5 sentences).

When quest is not completed:
- Set "quest_completed": false.
- Generate next task as usual at the end of narration.
- last_task_summary must summarize that next task.

CONSTRAINTS  
- Do not step outside the given lore and style.  
- Do not change skill types.  
- Do not break sequence: every new turn must logically continue the previous one, based on the passed world_snapshot and last_task_summary.
- In every response you must include:  
    answer evaluation,  
    story development,  
    a new task,  
    updated player state in the described format.

STRICT OUTPUT FORMAT
Every one of your answers MUST strictly follow the JSON format below so it can be parsed automatically.
No text before or after the structure.  
The comment field is the textual evaluation of the player’s answer (qualitative analysis).
The progress_delta field is the numeric progress score for the turn (-1 / 0 / +1), which an external system uses to update quest_level. Thus, “answer evaluation” is expressed by comment and progress_delta.
The narration field is a description of the consequences of the answer and scene development (3-8 sentences, can include dialogues). At the end of this text, clearly formulate the new task for the player in a separate paragraph.
The last_task_summary field is 1-3 sentences: concise essence of the new task/puzzle the player will answer next turn.
The world_snapshot is 2-5 sentences: where the hero is now, with whom, what they are trying to do, what threats or goals are in focus.
The quest_completed field is a boolean indicated passed quest or not.
If quest_completed is true, any instruction about creating a new task is overridden.

Return a JSON with the name as follows:
{{
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
        state.last_progress += int(result_ai["progress_delta"])
        state.is_completed = result_ai["quest_completed"]
        if result_ai["quest_completed"]:
            message = json.dumps({ "address": sender_address.as_hex, "action": "complete" })
            abi = [str]
            encoder = genvm_eth.MethodEncoder("", abi, bool)
            message_bytes = encoder.encode_call([message])[4:]
            bridge_contract = gl.get_contract_at(self.bridge_out)
            bridge_contract.emit().send_message(40245, self.escrow, message_bytes)


    @gl.public.view
    def get_my_quest(self) -> str:
        try:
            sender_address = gl.message.sender_address
            state = self.states.get(sender_address, None)
            if state is None:
                return json.dumps({
                "creator": self.creator.as_hex,
                "title": self.title,
                "desc": self.desc,
                "image": self.image,
                "end_date": self.end_date,
                "pool": str(self.pool),
                "is_active": str(self.is_active)
            })
            return json.dumps({
                "creator": self.creator.as_hex,
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

    def _only_bridge(self):
        if gl.message.sender_address != self.bridge_in:
            raise Exception("You are not the bridge")

def _check_time_due(time_quest: str, time_str: str) -> bool:
    return float(_convert_time(time_str)) > float(time_quest)

def _convert_time(time_str: str) -> str:
    dt = datetime.strptime(time_str, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc)
    return str(dt.timestamp())

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