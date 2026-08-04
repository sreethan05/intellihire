import asyncio
import math
import random
random.seed(42)  # Deterministic exam generation for fairness/audit
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from .db import db
from .logger import logger

# --- Difficulty Calibration Engine ---
difficulty_profiles = {
    "easy": {
        "targetBloomLevels": ["remember", "understand"],
        "conceptDepthMin": 1,
        "conceptDepthMax": 1,
        "timeRangeMin": 30,
        "timeRangeMax": 90,
        "prerequisiteDepth": 0,
        "marksBase": 1,
        "marksPerQuestion": 1,
        "distractorComplexity": 0.2,
    },
    "medium": {
        "targetBloomLevels": ["understand", "apply"],
        "conceptDepthMin": 2,
        "conceptDepthMax": 2,
        "timeRangeMin": 60,
        "timeRangeMax": 180,
        "prerequisiteDepth": 1,
        "marksBase": 1,
        "marksPerQuestion": 1,
        "distractorComplexity": 0.5,
    },
    "hard": {
        "targetBloomLevels": ["apply", "analyze"],
        "conceptDepthMin": 2,
        "conceptDepthMax": 3,
        "timeRangeMin": 120,
        "timeRangeMax": 300,
        "prerequisiteDepth": 2,
        "marksBase": 1,
        "marksPerQuestion": 2,
        "distractorComplexity": 0.7,
    },
    "very_hard": {
        "targetBloomLevels": ["analyze", "evaluate", "create"],
        "conceptDepthMin": 3,
        "conceptDepthMax": 5,
        "timeRangeMin": 180,
        "timeRangeMax": 600,
        "prerequisiteDepth": 3,
        "marksBase": 2,
        "marksPerQuestion": 3,
        "distractorComplexity": 0.9,
    },
}

# Topic taxonomy — maps broad topics to related subtopics
topic_taxonomy = {
    "python": ["python", "dsa", "algorithms", "data structures"],
    "javascript": ["javascript", "web development", "frontend", "node.js"],
    "java": ["java", "oops", "dsa", "algorithms"],
    "c++": ["c++", "dsa", "algorithms", "system programming"],
    "sql": ["sql", "dbms", "database", "data structures"],
    "dsa": ["dsa", "algorithms", "data structures", "python", "java", "c++"],
    "algorithms": ["algorithms", "dsa", "complexity analysis", "dynamic programming"],
    "os": ["os", "operating systems", "system programming", "memory management"],
    "dbms": ["dbms", "sql", "database", "normalization", "transactions"],
    "networks": ["networks", "computer networks", "tcp/ip", "http"],
    "oops": ["oops", "java", "c++", "python"],
    "web": ["web", "web development", "javascript", "html", "css"],
    "aptitude": ["aptitude", "logical reasoning", "mathematics", "quantitative"],
    "general": ["python", "javascript", "java", "sql", "dsa", "algorithms", "os", "dbms", "networks", "oops"],
    "technical": ["python", "javascript", "java", "sql", "dsa", "algorithms", "os", "dbms", "networks", "oops"],

    # Recruiter Selectable Topic Mappings
    "typescript": ["javascript", "web"],
    "object-oriented programming (oops)": ["oops"],
    "database management systems (dbms)": ["dbms", "sql"],
    "operating systems (os)": ["os"],
    "computer networks (cn)": ["networks"],
    "system design": ["web", "dbms", "networks", "oops"],
    "web development": ["web", "javascript"],
    "html": ["web"],
    "css": ["web"],
    "arrays": ["dsa", "algorithms"],
    "strings": ["dsa", "algorithms"],
    "linked lists": ["dsa", "algorithms"],
    "stacks": ["dsa", "algorithms"],
    "queues": ["dsa", "algorithms"],
    "binary trees": ["dsa", "algorithms"],
    "binary search trees (bst)": ["dsa", "algorithms"],
    "heaps & priority queues": ["dsa", "algorithms"],
    "hashing & hashmaps": ["dsa", "algorithms"],
    "graphs": ["dsa", "algorithms"],
    "tries": ["dsa", "algorithms"],
    "segment trees": ["dsa", "algorithms"],
    "disjoint set union (dsu)": ["dsa", "algorithms"],
    "monotonic stack": ["dsa", "algorithms"],
    "binary search": ["algorithms", "dsa"],
    "sorting algorithms": ["algorithms", "dsa"],
    "recursion": ["algorithms", "dsa"],
    "backtracking": ["algorithms", "dsa"],
    "two pointers": ["algorithms", "dsa"],
    "sliding window": ["algorithms", "dsa"],
    "greedy algorithms": ["algorithms", "dsa"],
    "dynamic programming (dp)": ["algorithms", "dsa"],
    "divide & conquer": ["algorithms", "dsa"],
    "graph traversals (dfs/bfs)": ["algorithms", "dsa"],
    "shortest path algorithms": ["algorithms", "dsa"],
    "minimum spanning tree (mst)": ["algorithms", "dsa"],
    "bit manipulation": ["algorithms", "dsa"],
    "quantitative aptitude": ["aptitude"],
    "logical reasoning": ["aptitude"],
    "verbal ability": ["aptitude"],
    "data interpretation": ["aptitude"],
    "percentages": ["aptitude"],
    "profit and loss": ["aptitude"],
    "time and work": ["aptitude"],
    "probability": ["aptitude"],
    "number series": ["aptitude"],
    "permutations and combinations": ["aptitude"],
    "machine learning (ml)": ["python", "aptitude"],
    "artificial intelligence (ai)": ["python", "aptitude"],
    "deep learning": ["python", "aptitude"],
    "natural language processing (nlp)": ["python", "aptitude"],
    "data science": ["python", "aptitude"],
    "blockchain": ["c++", "java"],
    "c": ["c++"],
    "c#": ["java", "oops"],
    "go": ["c++", "networks"],
    "rust": ["c++"],
    "ruby": ["python"],
    "swift": ["java", "oops"],
    "php": ["javascript", "web"],
    "kotlin": ["java", "oops"],
    "software engineering": ["oops", "general"],
    "cloud computing": ["networks", "general"],
    "cybersecurity": ["networks", "os"],
    "devops": ["os", "networks"],
    "docker": ["os"],
    "git & version control": ["general"]
}

# Bloom taxonomy weights for scoring
bloom_weights = {
    "remember": 1,
    "understand": 2,
    "apply": 3,
    "analyze": 4,
    "evaluate": 5,
    "create": 5,
}


def weighted_random_sample(items: list, weights: list, count: int) -> list:
    if len(items) <= count:
        return list(items)
    
    result = []
    pool = [{"item": item, "weight": weights[i]} for i, item in enumerate(items)]
    
    for _ in range(count):
        total_weight = sum(p["weight"] for p in pool)
        if total_weight <= 0:
            break
        
        r = random.uniform(0, total_weight)
        cumulative = 0.0
        selected_idx = 0
        for j, p in enumerate(pool):
            cumulative += p["weight"]
            if r <= cumulative:
                selected_idx = j
                break
        
        result.append(pool[selected_idx]["item"])
        pool.pop(selected_idx)
        
    return result


def topic_match_score(question_topic: str, requested_topic: str) -> float:
    q = question_topic.lower().strip()
    r = requested_topic.lower().strip()
    
    if q == r:
        return 1.0
    
    related = topic_taxonomy.get(r, []) or topic_taxonomy.get(r.replace(" ", ""), [])
    if any(t == q or q in t or t in q for t in related):
        return 0.7
    
    return 0.1  # Weak match


def difficulty_match_score(
    question_difficulty: str,
    question_bloom: str,
    question_concept_count: int,
    requested_difficulty: str
) -> float:
    profile = difficulty_profiles.get(requested_difficulty)
    if not profile:
        return 0.5
    
    # Exact difficulty match
    diff_match = 1.0 if question_difficulty.lower() == requested_difficulty else 0.3
    
    # Bloom level match
    bloom_match = 1.0 if question_bloom.lower() in profile["targetBloomLevels"] else 0.2
    
    # Concept depth match
    concept_in_range = profile["conceptDepthMin"] <= question_concept_count <= profile["conceptDepthMax"]
    concept_match = 1.0 if concept_in_range else 0.4
    
    return (diff_match * 0.4) + (bloom_match * 0.35) + (concept_match * 0.25)


def calculate_diversity_score(
    question_concepts: List[str],
    selected_concepts: Set[str]
) -> float:
    overlap = len([c for c in question_concepts if c in selected_concepts])
    total = len(question_concepts) or 1
    overlap_ratio = overlap / total
    return 1.0 - overlap_ratio  # 1.0 = completely new concepts, 0.0 = all concepts already used


def recency_score(last_used_at: Any) -> float:
    if not last_used_at:
        return 1.0  # Never used = highest score
    
    try:
        if isinstance(last_used_at, str):
            dt = datetime.fromisoformat(last_used_at.replace("Z", "+00:00"))
        elif isinstance(last_used_at, datetime):
            dt = last_used_at
        else:
            return 1.0
        
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
            
        now = datetime.now(timezone.utc)
        delta = now - dt
        days_since = delta.total_seconds() / (24 * 3600)
    except Exception:
        return 1.0
        
    if days_since > 30:
        return 1.0
    if days_since > 14:
        return 0.8
    if days_since > 7:
        return 0.6
    if days_since > 3:
        return 0.4
    return 0.2  # Recently used


def apply_variation(question: dict, depth: int) -> Tuple[dict, str]:
    if depth == 0:
        return question, ""
        
    q_copy = dict(question)
    text = q_copy.get("question_text", "")
    a = q_copy.get("option_a", "")
    b = q_copy.get("option_b", "")
    c = q_copy.get("option_c", "")
    d = q_copy.get("option_d", "")
    correct = q_copy.get("correct_option", "")
    note = ""
    
    if depth == 1:
        # Light variation: swap variable names, adjust numbers, change phrasing
        var_name_map = {"x": "a", "y": "b", "z": "c", "i": "j", "n": "m", "arr": "nums", "s": "str"}
        for k, v in var_name_map.items():
            pattern = re.compile(rf"\b{k}\b")
            text = pattern.sub(v, text)
            
        # Adjust small numbers in the question text (not options)
        def replace_num(match):
            num = match.group(1)
            suffix = match.group(2)
            n = int(num)
            if 2 < n < 20:
                return f"{n + 1}{suffix}"
            return match.group(0)
            
        text = re.sub(r"(\d{1,2})(\D)", replace_num, text)
        note = "varied-v1"
        
    elif depth == 2:
        # Deep variation: rephrase the question, shuffle distractors
        rephrases = [
            ("What is the output of", "What will be printed when"),
            ("Which of the following", "Which one of these"),
            ("What is the correct", "What is the right"),
            ("How do you", "What is the best way to"),
        ]
        
        for old_phrase, new_phrase in rephrases:
            text = re.sub(re.escape(old_phrase), new_phrase, text, flags=re.IGNORECASE)
            
        # Shuffle options (but track correct answer)
        options = [
            {"key": "A", "text": a},
            {"key": "B", "text": b},
            {"key": "C", "text": c},
            {"key": "D", "text": d},
        ]
        
        random.shuffle(options)
        
        a = options[0]["text"]
        b = options[1]["text"]
        c = options[2]["text"]
        d = options[3]["text"]
        
        # Find new key for old correct option
        old_correct = question.get("correct_option", "A")
        new_correct = "A"
        for i, opt in enumerate(options):
            if opt["key"] == old_correct:
                new_correct = ["A", "B", "C", "D"][i]
                break
        
        correct = new_correct
        note = "varied-v2-shuffled"
        
    q_copy["question_text"] = text
    q_copy["option_a"] = a
    q_copy["option_b"] = b
    q_copy["option_c"] = c
    q_copy["option_d"] = d
    q_copy["correct_option"] = correct
    
    return q_copy, note


def apply_coding_variation(question: dict, depth: int) -> Tuple[dict, str]:
    if depth == 0:
        return question, ""
        
    q_copy = dict(question)
    description = q_copy.get("description", "")
    test_cases = list(q_copy.get("test_cases") or [])
    sample_cases = list(q_copy.get("sample_cases") or [])
    note = ""
    
    if depth >= 1:
        # Adjust numeric constraints in description
        def replace_num_desc(match):
            num = match.group(1)
            suffix = match.group(2)
            n = int(num)
            if 2 < n < 50:
                return f"{n + 2}{suffix}"
            return match.group(0)
            
        description = re.sub(r"(\d{1,3})(\D)", replace_num_desc, description)
        
        # Adjust test case inputs and expected outputs consistently
        new_test_cases = []
        for tc in test_cases:
            tc_copy = dict(tc)
            input_val = str(tc_copy.get("input", ""))
            expected_val = str(tc_copy.get("expected_output", ""))

            def replace_num_input(match):
                num = match.group(1)
                suffix = match.group(2)
                n = int(num)
                if 1 < n < 20:
                    return f"{n + 1}{suffix}"
                return match.group(0)

            # Apply the same numeric transformation to BOTH input AND expected output
            tc_copy["input"] = re.sub(r"(\d{1,2})(\D)", replace_num_input, input_val)
            tc_copy["expected_output"] = re.sub(r"(\d{1,2})(\D)", replace_num_input, expected_val)
            new_test_cases.append(tc_copy)
        test_cases = new_test_cases
        note = "varied-coding-v1"
        
    q_copy["description"] = description
    q_copy["test_cases"] = test_cases
    q_copy["sample_cases"] = sample_cases
    return q_copy, note


async def select_mcq_questions(config: dict) -> List[dict]:
    topic = config.get("topic")
    difficulty = config.get("difficulty")
    count = config.get("count")
    balance_subtopics = config.get("balanceSubtopics")
    variation_depth = config.get("variationDepth", 1)
    exclude_question_ids = config.get("excludeQuestionIds") or []
    
    logger.info(f"ExamPipeline: selecting MCQ questions for topic={topic}, difficulty={difficulty}, count={count}")
    
    # 1. Fetch all questions matching difficulty
    res = await db.from_("questions").select(
        "id, question_text, option_a, option_b, option_c, option_d, correct_option, marks, topic, subtopic, difficulty, concept_tags, bloom_level, estimated_time_sec, last_used_at"
    ).eq("difficulty", difficulty).execute()
    
    if res.error:
        logger.error(f"ExamPipeline: failed to fetch questions: {res.error.message}")
        raise RuntimeError(f"Failed to fetch questions: {res.error.message}")
        
    raw_questions = res.data or []
    
    if not raw_questions:
        # Fallback: try any difficulty for this topic
        fallback_res = await db.from_("questions").select(
            "id, question_text, option_a, option_b, option_c, option_d, correct_option, marks, topic, subtopic, difficulty, concept_tags, bloom_level, estimated_time_sec, last_used_at"
        ).ilike("topic", f"%{topic}%").execute()
        
        fallback_questions = fallback_res.data or []
        if not fallback_questions:
            raise RuntimeError(f"No questions found for topic: {topic}. Seed the question bank first.")
            
        raw_questions.extend(fallback_questions)
        
    # 2. Score all questions
    selected_concepts = set()
    scored = []
    
    for q in raw_questions:
        if q.get("id") in exclude_question_ids:
            continue
            
        concept_tags = q.get("concept_tags")
        if not isinstance(concept_tags, list):
            concept_tags = []
        concept_count = len(concept_tags) or 1
        
        topic_score_val = topic_match_score(q.get("topic") or "", topic)
        if topic_score_val < 0.3:
            continue
            
        diff_score_val = difficulty_match_score(
            q.get("difficulty") or "medium",
            q.get("bloom_level") or "understand",
            concept_count,
            difficulty
        )
        
        diversity_score_val = calculate_diversity_score(concept_tags, selected_concepts)
        recency_val = recency_score(q.get("last_used_at"))
        bloom_level_str = (q.get("bloom_level") or "understand").lower()
        bloom_score_val = bloom_weights.get(bloom_level_str, 2)
        
        # Weighted final score
        final_score = (
            (topic_score_val * 0.30) +
            (diff_score_val * 0.25) +
            (diversity_score_val * 0.20) +
            (recency_val * 0.15) +
            ((bloom_score_val / 5.0) * 0.10)
        )
        
        scored.append({
            "id": q.get("id"),
            "rawScore": final_score,
            "topicScore": topic_score_val,
            "difficultyScore": diff_score_val,
            "diversityScore": diversity_score_val,
            "recencyScore": recency_val,
            "bloomScore": bloom_score_val / 5.0,
            "finalScore": final_score,
        })
        
    # 3. If balancing subtopics, group and ensure coverage
    selected_questions = []
    
    if balance_subtopics and len(scored) > count:
        subtopic_groups = {}
        for s in scored:
            raw = next((q for q in raw_questions if q.get("id") == s["id"]), None)
            subtopic = raw.get("subtopic") or "general" if raw else "general"
            if subtopic not in subtopic_groups:
                subtopic_groups[subtopic] = []
            subtopic_groups[subtopic].append(s)
            
        subtopics = list(subtopic_groups.keys())
        per_subtopic = math.ceil(count / len(subtopics))
        
        for subtopic in subtopics:
            group = sorted(subtopic_groups[subtopic], key=lambda x: x["finalScore"], reverse=True)
            picks = group[:per_subtopic]
            for p in picks:
                raw = next((q for q in raw_questions if q.get("id") == p["id"]), None)
                if raw:
                    selected_questions.append(raw)
                    
        # Trim if we have too many
        if len(selected_questions) > count:
            selected_questions = sorted(
                selected_questions,
                key=lambda x: next((s["finalScore"] for s in scored if s["id"] == x.get("id")), 0.0),
                reverse=True
            )[:count]
            
        # Fill if we have too few
        if len(selected_questions) < count:
            used_ids = {q.get("id") for q in selected_questions}
            remaining = sorted(
                [s for s in scored if s["id"] not in used_ids],
                key=lambda x: x["finalScore"],
                reverse=True
            )
            for s in remaining:
                if len(selected_questions) >= count:
                    break
                raw = next((q for q in raw_questions if q.get("id") == s["id"]), None)
                if raw:
                    selected_questions.append(raw)
    else:
        # Standard weighted random selection
        sorted_scored = sorted(scored, key=lambda x: x["finalScore"], reverse=True)
        top_pool = sorted_scored[:min(len(sorted_scored), count * 3)]
        
        weights = [s["finalScore"] for s in top_pool]
        items = [next((q for q in raw_questions if q.get("id") == s["id"]), None) for s in top_pool]
        items = [it for it in items if it is not None]
        
        selected_questions = weighted_random_sample(items, weights, count)
        
    # 4. Apply variations and mark concepts as used
    result = []
    profile = difficulty_profiles.get(difficulty) or difficulty_profiles["medium"]
    
    for q in selected_questions:
        concept_tags = q.get("concept_tags")
        if not isinstance(concept_tags, list):
            concept_tags = []
        for c in concept_tags:
            selected_concepts.add(c)
            
        varied_q, note = apply_variation(q, variation_depth)
        
        result.append({
            "id": q.get("id"),
            "question_text": varied_q.get("question_text"),
            "option_a": varied_q.get("option_a"),
            "option_b": varied_q.get("option_b"),
            "option_c": varied_q.get("option_c"),
            "option_d": varied_q.get("option_d"),
            "correct_option": varied_q.get("correct_option"),
            "marks": q.get("marks") or profile["marksPerQuestion"],
            "topic": q.get("topic") or topic,
            "subtopic": q.get("subtopic") or "general",
            "difficulty": q.get("difficulty") or difficulty,
            "concept_tags": concept_tags,
            "bloom_level": q.get("bloom_level") or "understand",
            "isVariation": note != "",
            "variationNote": note if note else None,
        })
        
    # 5. Update last_used_at for selected questions (fire-and-forget)
    now_str = datetime.now(timezone.utc).isoformat()
    async def update_last_used(qid):
        try:
            await db.from_("questions").update({"last_used_at": now_str}).eq("id", qid).execute()
        except Exception as e:
            logger.warning(f"Failed to update last_used_at for question {qid}: {e}")
            
    for q in result:
        asyncio.create_task(update_last_used(q["id"]))
        
    logger.info(f"ExamPipeline: MCQ selection complete. Selected {len(result)} questions.")
    return result


async def select_coding_questions(config: dict) -> List[dict]:
    topic = config.get("topic")
    difficulty = config.get("difficulty")
    count = config.get("count")
    variation_depth = config.get("variationDepth", 1)
    exclude_question_ids = config.get("excludeQuestionIds") or []
    
    logger.info(f"ExamPipeline: selecting coding questions for topic={topic}, difficulty={difficulty}, count={count}")
    
    res = await db.from_("coding_questions").select(
        "id, title, description, difficulty, starter_code, test_cases, sample_cases, hidden_cases, input_format, output_format, constraints_text, topic_tags, marks, time_limit_ms, memory_limit_kb"
    ).eq("difficulty", difficulty).execute()
    
    if res.error:
        logger.error(f"ExamPipeline: failed to fetch coding questions: {res.error.message}")
        raise RuntimeError(f"Failed to fetch coding questions: {res.error.message}")
        
    raw_questions = res.data or []
    
    if not raw_questions:
        fallback_res = await db.from_("coding_questions").select(
            "id, title, description, difficulty, starter_code, test_cases, sample_cases, hidden_cases, input_format, output_format, constraints_text, topic_tags, marks, time_limit_ms, memory_limit_kb"
        ).overlaps("topic_tags", [topic]).execute()
        
        fallback = fallback_res.data or []
        if not fallback:
            raise RuntimeError(f"No coding questions found for topic: {topic}. Seed the question bank first.")
            
        raw_questions.extend(fallback)
        
    # Score coding questions
    selected_concepts = set()
    scored = []
    
    for q in raw_questions:
        if q.get("id") in exclude_question_ids:
            continue
            
        tags = q.get("topic_tags")
        if not isinstance(tags, list):
            tags = []
            
        topic_scores = [topic_match_score(q.get("title") or "", topic)] + [topic_match_score(t, topic) for t in tags]
        topic_score_val = max(topic_scores) if topic_scores else 0.1
        
        if topic_score_val < 0.3:
            continue
            
        diff_match = 1.0 if (q.get("difficulty") or "medium") == difficulty else 0.3
        diversity_score_val = calculate_diversity_score(tags, selected_concepts)
        final_score = (topic_score_val * 0.45) + (diff_match * 0.30) + (diversity_score_val * 0.25)
        
        scored.append({
            "id": q.get("id"),
            "rawScore": final_score,
            "topicScore": topic_score_val,
            "difficultyScore": diff_match,
            "diversityScore": diversity_score_val,
            "recencyScore": 1.0,
            "bloomScore": 0.5,
            "finalScore": final_score,
        })
        
    sorted_scored = sorted(scored, key=lambda x: x["finalScore"], reverse=True)
    top_pool = sorted_scored[:min(len(sorted_scored), count * 3)]
    weights = [s["finalScore"] for s in top_pool]
    items = [next((q for q in raw_questions if q.get("id") == s["id"]), None) for s in top_pool]
    items = [it for it in items if it is not None]
    
    selected_questions = weighted_random_sample(items, weights, count)
    
    result = []
    profile = difficulty_profiles.get(difficulty) or difficulty_profiles["medium"]
    
    for q in selected_questions:
        tags = q.get("topic_tags")
        if not isinstance(tags, list):
            tags = []
        for t in tags:
            selected_concepts.add(t)
            
        varied_q, note = apply_coding_variation(q, variation_depth)
        
        result.append({
            "id": q.get("id"),
            "title": varied_q.get("title"),
            "description": varied_q.get("description"),
            "difficulty": q.get("difficulty") or difficulty,
            "starter_code": varied_q.get("starter_code") or "",
            "test_cases": varied_q.get("test_cases") or [],
            "sample_cases": varied_q.get("sample_cases") or [],
            "hidden_cases": varied_q.get("hidden_cases") or [],
            "input_format": q.get("input_format") or "",
            "output_format": q.get("output_format") or "",
            "constraints_text": q.get("constraints_text") or "",
            "topic_tags": tags,
            "marks": q.get("marks") or profile["marksPerQuestion"],
            "isVariation": note != "",
        })
        
    logger.info(f"ExamPipeline: coding selection complete. Selected {len(result)} coding questions.")
    return result


async def generate_exam(config: dict) -> dict:
    start_time = datetime.now()
    
    mcq_questions = []
    coding_questions = []
    
    question_type = config.get("questionType", "mixed")
    count = config.get("count", 10)
    topic = config.get("topic")
    difficulty = config.get("difficulty", "medium")
    
    if question_type in ("mcq", "mixed"):
        mcq_count = math.ceil(count * 0.7) if question_type == "mixed" else count
        mcq_questions = await select_mcq_questions({**config, "count": mcq_count})
        
    if question_type in ("coding", "mixed"):
        coding_count = math.floor(count * 0.3) if question_type == "mixed" else count
        if question_type == "mixed" and coding_count == 0 and count > 0:
            coding_count = 1
        coding_questions = await select_coding_questions({**config, "count": coding_count})
        
    # Calculate metadata
    all_topics = set()
    for q in mcq_questions:
        all_topics.add(q.get("subtopic", "general"))
        all_topics.add(q.get("topic", topic))
    for q in coding_questions:
        for t in q.get("topic_tags", []):
            all_topics.add(t)
            
    topic_coverage = {}
    for q in mcq_questions:
        sub = q.get("subtopic") or "general"
        topic_coverage[sub] = topic_coverage.get(sub, 0) + 1
        
    bloom_distribution = {}
    for q in mcq_questions:
        bloom = q.get("bloom_level") or "understand"
        bloom_distribution[bloom] = bloom_distribution.get(bloom, 0) + 1
        
    total_marks = sum(q.get("marks") or 1 for q in mcq_questions) + sum(q.get("marks") or 10 for q in coding_questions)
    total_q_count = len(mcq_questions) + len(coding_questions)
    actual_difficulty = total_marks / total_q_count if total_q_count > 0 else 1.0
    
    concept_diversity = len(all_topics) / total_q_count if total_q_count > 0 else 0.0
    
    estimated_time = 0
    for q in mcq_questions:
        ctags = q.get("concept_tags") or []
        estimated_time += 120 if len(ctags) > 2 else 60
    for q in coding_questions:
        diff = q.get("difficulty")
        if diff == "hard":
            estimated_time += 30
        elif diff == "medium":
            estimated_time += 20
        else:
            estimated_time += 15
            
    result = {
        "questions": mcq_questions,
        "codingQuestions": coding_questions,
        "metadata": {
            "topic": topic,
            "requestedDifficulty": difficulty,
            "actualDifficulty": actual_difficulty,
            "topicCoverage": topic_coverage,
            "conceptDiversity": concept_diversity,
            "bloomDistribution": bloom_distribution,
            "generationMethod": "IntelliHire-ExamPipeline-v1",
            "estimatedDurationMinutes": math.ceil(estimated_time / 60.0),
        }
    }
    
    duration = datetime.now() - start_time
    duration_ms = duration.total_seconds() * 1000
    logger.info(f"ExamPipeline: exam generated in {duration_ms:.2f}ms with metadata={result['metadata']}")
    
    return result


async def get_bank_stats() -> dict:
    mcq_count_res = await db.from_("questions").select("id", count="exact", head=True).execute()
    coding_count_res = await db.from_("coding_questions").select("id", count="exact", head=True).execute()
    
    mcq_count = mcq_count_res.count or 0
    coding_count = coding_count_res.count or 0
    
    topics_res = await db.from_("questions").select("topic").is_not("topic", None).execute()
    raw_topics = topics_res.data or []
    unique_topics = list({str(t.get("topic")) for t in raw_topics if t.get("topic")})
    
    difficulties_res = await db.from_("questions").select("difficulty").is_not("difficulty", None).execute()
    raw_diffs = difficulties_res.data or []
    
    diff_count = {}
    for d in raw_diffs:
        diff_str = str(d.get("difficulty"))
        diff_count[diff_str] = diff_count.get(diff_str, 0) + 1
        
    return {
        "totalMcq": mcq_count,
        "totalCoding": coding_count,
        "topics": unique_topics,
        "difficulties": diff_count,
        "healthy": mcq_count >= 50 and coding_count >= 10,
    }
