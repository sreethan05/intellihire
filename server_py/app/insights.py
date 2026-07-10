from typing import Dict, Any, List

DEFAULT_TOPICS = ["DSA", "DBMS", "OS", "Networking", "Communication", "Aptitude"]

STRENGTH_TEMPLATES = {
    "DSA": "Strong analytical skills and dynamic problem-solving proficiency in Data Structures & Algorithms.",
    "DBMS": "Excellent database concept knowledge, index design, query tuning, and schema normalization capabilities.",
    "OS": "Solid understanding of Operating System architectures, process management, memory optimization, and concurrency controls.",
    "Networking": "Good grasp of computer networking protocols, network layout modeling, routing, and HTTP lifecycle.",
    "Communication": "Strong verbal delivery, clarity of expression, and vocabulary during AI face-to-face interviews.",
    "Aptitude": "Sharp logical reasoning, mathematical proficiency, and structured quantitative aptitude.",
}

WEAKNESS_TEMPLATES = {
    "DSA": "Focus on optimization of space/time complexities in arrays, hashing, and trees.",
    "DBMS": "Revision recommended for DBMS transaction management, isolation levels, and indexing details.",
    "OS": "Needs improvement in process scheduling, CPU execution cycles, and deadlock detection controls.",
    "Networking": "Revise TCP/IP model layers, DNS, subnetting, and socket connection management fundamentals.",
    "Communication": "Focus on speech pacing, clarity, and key term usage during oral interview evaluations.",
    "Aptitude": "Spend more time solving analytical reasoning and quantitative aptitude exercises.",
}

def create_topic_scores() -> Dict[str, Dict[str, float]]:
    return {topic: {"total": 0.0, "count": 0.0} for topic in DEFAULT_TOPICS}

def feed_mcq_answer(topic_scores: Dict[str, Dict[str, float]], is_correct: bool, topic_raw: str = None) -> None:
    topic_raw = topic_raw or "Aptitude"
    key = "Aptitude"
    for k in topic_scores.keys():
        if k.lower() == topic_raw.lower():
            key = k
            break
    topic_scores[key]["total"] += 100.0 if is_correct else 0.0
    topic_scores[key]["count"] += 1.0

def feed_coding_submission(topic_scores: Dict[str, Dict[str, float]], score: float, max_marks: float = 10.0) -> None:
    pct = (score / max_marks) * 100.0 if max_marks > 0 else 0.0
    topic_scores["DSA"]["total"] += pct
    topic_scores["DSA"]["count"] += 1.0

def feed_communication_score(topic_scores: Dict[str, Dict[str, float]], communication_score: float) -> None:
    topic_scores["Communication"]["total"] += (communication_score or 0.0) * 10.0
    topic_scores["Communication"]["count"] += 1.0

def generate_insights(topic_scores: Dict[str, Dict[str, float]], empty_message_prefix: str = "Profile") -> Dict[str, Any]:
    radar_data = []
    for subject, val in topic_scores.items():
        score = round(val["total"] / val["count"]) if val["count"] > 0 else 0
        radar_data.append({"subject": subject, "score": score, "fullMark": 100})
        
    strengths = []
    weaknesses = []
    evaluated_count = 0
    
    for subject, val in topic_scores.items():
        if val["count"] > 0:
            evaluated_count += 1
            score = round(val["total"] / val["count"])
            if score >= 70:
                strengths.append(STRENGTH_TEMPLATES[subject])
            elif score < 50:
                weaknesses.append(WEAKNESS_TEMPLATES[subject])
                
    if evaluated_count == 0:
        strengths.append(f"{empty_message_prefix} is being populated as you take proctored placement exams.")
        weaknesses.append("Attempt assigned mock and placement exams to generate skill-based recommendations.")
    else:
        if not strengths:
            strengths.append("Keep taking exams to demonstrate mastery and unlock strengths.")
        if not weaknesses:
            weaknesses.append("Outstanding! No major performance weaknesses detected across evaluated topics.")
            
    return {
        "radarData": radar_data,
        "strengths": strengths,
        "weaknesses": weaknesses,
        "evaluatedCount": evaluated_count
    }
