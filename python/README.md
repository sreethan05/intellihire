# IntelliHire Python Utilities

This directory contains standalone Python scripts that provide additional computational power for proctoring checks, resume parsing, and analytics plotting.

## Contents

- **`proctor_detector.py`**: Face and gaze tracking detector using OpenCV. Checks video streams for head turns and multiple faces.
- **`resume_analyzer.py`**: NLP/regex based resume skill, email, and experience extractor.
- **`score_plotter.py`**: Performance analysis and histogram distribution plotter.

## Setup

It is recommended to run these utilities in a virtual environment.

1. Create a virtual environment:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Running Utilities

### Gaze and Proctor Detection Demo
Run the live webcam proctoring check:
```bash
python proctor_detector.py --demo
```

### Resume Parser
Parse a candidate resume PDF or text file:
```bash
python resume_analyzer.py <path_to_resume_pdf>
```

### Score distribution plotting
Plot candidate score analytics from mock data or a JSON array:
```bash
python score_plotter.py
```
