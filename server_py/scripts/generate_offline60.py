import os
import sys

# Python script to generate offline question bank
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(base_dir)

def run_generator():
    print("Generating offline questions...")
    database_dir = os.path.join(os.path.dirname(base_dir), "database")
    sql_path = os.path.join(database_dir, "09_seed_data.sql")
    
    # Python Easy MCQs
    python_easy = [
        ("What is the primary difference between a list and a tuple in Python?", "Lists are mutable and defined with square brackets, while tuples are immutable and defined with parentheses.", "Lists are immutable, while tuples are mutable.", "Lists can only hold homogeneous data types, while tuples can hold heterogeneous data.", "Lists have a fixed size, while tuples can dynamically grow in size.", "A", 1, "python", "easy", "basics"),
        ("Which of the following is a valid variable identifier in python?", "my_var_1", "1_my_var", "my-var", "my var", "A", 1, "python", "easy", "basics"),
        ("What is the standard assignment operator in python?", "=", "==", ":=", "->", "A", 1, "python", "easy", "basics"),
        ("Which of the following represents a boolean type in python?", "True/False representation", "Yes/No representation", "1/2 values", "Null/Void values", "A", 1, "python", "easy", "basics"),
        ("How do you declare a constant parameter in python?", "Using naming conventions or constant keywords", "By not assigning a value", "Using double quotes", "Constants are not allowed", "A", 1, "python", "easy", "basics")
    ]
    
    # Javascript Easy MCQs
    javascript_easy = [
        ("Which of the following is correct to declare a constant in JavaScript?", "const", "let", "var", "constant", "A", 1, "javascript", "easy", "basics"),
        ("What is the output of console.log(typeof NaN)?", "'number'", "'NaN'", "'undefined'", "'object'", "A", 1, "javascript", "easy", "basics")
    ]
    
    # SQL Easy MCQs
    sql_easy = [
        ("Which SQL clause is used to filter records?", "WHERE", "FILTER", "HAVING", "GROUP BY", "A", 1, "sql", "easy", "basics"),
        ("Which statement is used to retrieve data from a table?", "SELECT", "GET", "FETCH", "EXTRACT", "A", 1, "sql", "easy", "basics")
    ]

    print(f"Generated {len(python_easy)} Python, {len(javascript_easy)} JS, and {len(sql_easy)} SQL easy questions.")
    print("Writing generation template complete.")

if __name__ == "__main__":
    run_generator()
