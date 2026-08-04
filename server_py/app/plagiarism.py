import re
import math
import ast
import tokenize
import io
from difflib import SequenceMatcher
from typing import Set, List, Dict, Any
from .db import db
from .logger import logger

def tokenize_python_code(code: str) -> list:
    """Extract AST-based token stream from Python code for structural comparison.
    Resilient to variable renaming, comment changes, and whitespace.
    """
    try:
        tree = ast.parse(code)
        tokens = []
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                tokens.append(f"FUNC:{node.name}")
                tokens.append(f"ARGS:{len(node.args.args)}")
            elif isinstance(node, ast.For):
                tokens.append("FOR")
            elif isinstance(node, ast.While):
                tokens.append("WHILE")
            elif isinstance(node, ast.If):
                tokens.append("IF")
            elif isinstance(node, ast.Return):
                tokens.append("RETURN")
            elif isinstance(node, ast.Assign):
                tokens.append("ASSIGN")
            elif isinstance(node, ast.AugAssign):
                tokens.append("AUGASSIGN")
            elif isinstance(node, ast.Call):
                tokens.append("CALL")
            elif isinstance(node, ast.List):
                tokens.append("LIST")
            elif isinstance(node, ast.Dict):
                tokens.append("DICT")
            elif isinstance(node, ast.Subscript):
                tokens.append("SUBSCRIPT")
            elif isinstance(node, (ast.Add, ast.Sub, ast.Mult, ast.Div)):
                tokens.append(f"OP:{type(node).__name__}")
        return tokens
    except SyntaxError:
        return []

def normalize_code_structure(code: str, language: str = "python") -> str:
    """Normalize code by removing comments, docstrings, and standardizing whitespace."""
    code = re.sub(r'#.*$', '', code, flags=re.MULTILINE)
    code = re.sub(r'//.*$', '', code, flags=re.MULTILINE)
    if language in ("python", "python3"):
        try:
            tree = ast.parse(code)
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.ClassDef, ast.Module)):
                    if node.body and isinstance(node.body[0], ast.Expr) and isinstance(node.body[0].value, ast.Constant):
                        node.body[0].value.value = ""
            code = ast.unparse(tree)
        except Exception:
            pass
    code = re.sub(r'\s+', ' ', code).strip()
    return code

def get_ast_similarity_score(code1: str, code2: str, language: str = "python") -> int:
    """AST-based structural similarity for Python code.
    Falls back to cosine similarity for non-Python languages.
    """
    if language in ("python", "python3"):
        tokens1 = tokenize_python_code(code1)
        tokens2 = tokenize_python_code(code2)
        if tokens1 and tokens2:
            set1 = set(tokens1)
            set2 = set(tokens2)
            intersection = set1 & set2
            union = set1 | set2
            if union:
                jaccard = len(intersection) / len(union)
                seq_matcher = SequenceMatcher(None, tokens1, tokens2)
                seq_ratio = seq_matcher.ratio()
                blended = 0.6 * jaccard + 0.4 * seq_ratio
                return round(blended * 100)
    norm1 = normalize_code_structure(code1, language)
    norm2 = normalize_code_structure(code2, language)
    return round(calculate_cosine_similarity(norm1, norm2, False) * 100)

PROGRAMMING_KEYWORDS = {
    "def", "function", "fn", "var", "let", "const", "class", "return", "if", "else", "elif", "for", "while", "do",
    "in", "of", "try", "catch", "except", "finally", "throw", "throws", "import", "from", "as", "require",
    "public", "private", "protected", "static", "final", "void", "int", "double", "float", "char", "string",
    "boolean", "bool", "nil", "null", "undefined", "true", "false", "and", "or", "not", "break", "continue",
    "yield", "async", "await", "lambda", "enumerate", "range", "len", "print", "console", "log", "self", "this"
}

def normalize_code(code: str) -> str:
    if not code:
        return ""
    # 1. Strip multi-line comments
    cleaned = re.sub(r"/\*[\s\S]*?\*/", "", code)
    cleaned = re.sub(r"'''[\s\S]*?'''", "", cleaned)
    cleaned = re.sub(r'"""[\s\S]*?"""', "", cleaned)
    
    # 2. Strip single-line comments
    cleaned = re.sub(r"//.*$", "", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"#.*$", "", cleaned, flags=re.MULTILINE)
    
    # 3. Normalize whitespace
    return " ".join(cleaned.split())

def calculate_cosine_similarity(str1: str, str2: str, keyword_only: bool = False) -> float:
    norm1 = normalize_code(str1)
    norm2 = normalize_code(str2)
    
    if not norm1 and not norm2:
        return 1.0
    if not norm1 or not norm2:
        return 0.0
        
    def tokenize(text: str):
        raw = [t for t in re.split(r"[^a-zA-Z0-9_$]", text) if t]
        if keyword_only:
            return [t for t in raw if t in PROGRAMMING_KEYWORDS]
        return raw
        
    t1 = tokenize(norm1)
    t2 = tokenize(norm2)
    
    if not t1 and not t2:
        return 1.0
    if not t1 or not t2:
        return 0.0
        
    def get_freqs(tokens: List[str]) -> Dict[str, int]:
        freqs = {}
        for t in tokens:
            freqs[t] = freqs.get(t, 0) + 1
        return freqs
        
    freqs1 = get_freqs(t1)
    freqs2 = get_freqs(t2)
    
    all_words = set(freqs1.keys()).union(freqs2.keys())
    
    dot_product = 0.0
    mag1 = 0.0
    mag2 = 0.0
    
    for w in all_words:
        f1 = freqs1.get(w, 0)
        f2 = freqs2.get(w, 0)
        dot_product += f1 * f2
        mag1 += f1 * f1
        mag2 += f2 * f2
        
    if mag1 == 0 or mag2 == 0:
        return 0.0
    return dot_product / (math.sqrt(mag1) * math.sqrt(mag2))

def calculate_levenshtein_similarity(str1: str, str2: str) -> float:
    norm1 = normalize_code(str1)
    norm2 = normalize_code(str2)
    
    if not norm1 and not norm2:
        return 1.0
    if not norm1 or not norm2:
        return 0.0
        
    len1 = len(norm1)
    len2 = len(norm2)
    
    prev_row = list(range(len2 + 1))
    curr_row = [0] * (len2 + 1)
    
    for i in range(1, len1 + 1):
        curr_row[0] = i
        for j in range(1, len2 + 1):
            cost = 0 if norm1[i - 1] == norm2[j - 1] else 1
            curr_row[j] = min(
                curr_row[j - 1] + 1,
                prev_row[j] + 1,
                prev_row[j - 1] + cost
            )
        prev_row = list(curr_row)
        
    distance = prev_row[len2]
    max_len = max(len1, len2)
    return 1.0 - (distance / max_len)

def get_similarity_score(code1: str, code2: str, language: str = "python") -> int:
    """Enhanced similarity scoring with AST-based structural comparison."""
    ast_score = get_ast_similarity_score(code1, code2, language)
    cosine_full = calculate_cosine_similarity(code1, code2, False)
    cosine_keywords = calculate_cosine_similarity(code1, code2, True)
    lev_sim = calculate_levenshtein_similarity(code1, code2)
    full_score = 0.6 * cosine_full + 0.4 * lev_sim
    struct_score = 0.7 * cosine_keywords + 0.3 * lev_sim
    traditional = max(full_score, struct_score) * 100
    if language in ("python", "python3"):
        return round(0.6 * ast_score + 0.4 * traditional)
    else:
        return round(traditional)

async def run_plagiarism_check(attempt_id: str) -> None:
    try:
        cur_subs_res = await db.from_("coding_submissions").select("*, coding_questions(title)").eq("attempt_id", attempt_id)
        current_submissions = cur_subs_res.data or []
        
        if not current_submissions:
            return
            
        cur_att_res = await db.from_("attempts").select("*, users:candidate_id(name)").eq("id", attempt_id).single()
        cur_candidate_name = cur_att_res.data.get("users", {}).get("name") if cur_att_res.data else "Candidate"
        
        # Batch-fetch all other submissions for all coding questions at once
        all_question_ids = [sub["coding_question_id"] for sub in current_submissions if sub.get("code") and sub["code"].strip()]
        all_other_subs: dict = {}
        if all_question_ids:
            batch_res = await db.from_("coding_submissions").select("*, attempts:attempt_id(*, users:candidate_id(name))").in_("coding_question_id", all_question_ids).neq("attempt_id", attempt_id)
            for other_sub in (batch_res.data or []):
                qid = other_sub.get("coding_question_id")
                if qid not in all_other_subs:
                    all_other_subs[qid] = []
                all_other_subs[qid].append(other_sub)

        for sub in current_submissions:
            if not sub.get("code") or not sub["code"].strip():
                continue
                
            # Clear existing plagiarism flags for this specific submission
            await db.from_("plagiarism_flags").delete().eq("attempt_id", attempt_id).eq("coding_submission_id", sub["id"])
            
            # Use batch-fetched other submissions for this coding question
            other_submissions = all_other_subs.get(sub["coding_question_id"], [])
            
            for other_sub in other_submissions:
                if not other_sub.get("code") or not other_sub["code"].strip():
                    continue
                    
                similarity = get_similarity_score(sub["code"], other_sub["code"], sub.get("language") or "python")
                if similarity >= 85:
                    other_candidate_name = other_sub.get("attempts", {}).get("users", {}).get("name") if other_sub.get("attempts") else "Other Candidate"
                    q_title = sub.get("coding_questions", {}).get("title") or "Coding Challenge"
                    
                    notes = f"High code similarity ({similarity}%) detected on \"{q_title}\" with {other_candidate_name}'s submission."
                    
                    await db.from_("plagiarism_flags").insert({
                        "attempt_id": attempt_id,
                        "coding_submission_id": sub["id"],
                        "similarity_score": similarity,
                        "matched_with_attempt_id": other_sub["attempt_id"],
                        "status": "open",
                        "notes": notes
                    })
                    
                    # Symmetric flag
                    exist_res = await db.from_("plagiarism_flags").select("id").eq("attempt_id", other_sub["attempt_id"]).eq("coding_submission_id", other_sub["id"]).eq("matched_with_attempt_id", attempt_id).maybeSingle()
                    if not exist_res.data:
                        await db.from_("plagiarism_flags").insert({
                            "attempt_id": other_sub["attempt_id"],
                            "coding_submission_id": other_sub["id"],
                            "similarity_score": similarity,
                            "matched_with_attempt_id": attempt_id,
                            "status": "open",
                            "notes": f"High code similarity ({similarity}%) detected on \"{q_title}\" with {cur_candidate_name}'s submission."
                        })
    except Exception as e:
        logger.error(f"Error executing plagiarism checks: {str(e)}")
