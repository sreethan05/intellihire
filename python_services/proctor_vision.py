import cv2
import numpy as np
import base64
import json
import os
import sys

class ProctorVisionAuditor:
    """
    A Python-based AI proctoring tool to analyze candidate exam webcam snapshots.
    Uses OpenCV to perform face detection, eye tracking, and multiple person detection.
    """
    def __init__(self, cascade_path=None):
        # Fallback to default Haar cascades
        self.face_cascade = cv2.CascadeClassifier(
            cascade_path or cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        )
        self.eye_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + 'haarcascade_eye.xml'
        )

    def decode_base64_image(self, base64_str):
        """Decode a base64 encoded image string into an OpenCV image (numpy array)."""
        if "," in base64_str:
            base64_str = base64_str.split(",")[1]
        img_data = base64.b64decode(base64_str)
        nparr = np.frombuffer(img_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        return img

    def analyze_snapshot(self, base64_image):
        """
        Analyze a webcam snapshot for common proctoring violations:
        - No face detected (candidate walked away)
        - Multiple faces detected (external help/collusion)
        - Candidate looking away (eyes not focused on screen)
        """
        try:
            img = self.decode_base64_image(base64_image)
            if img is None:
                return {
                    "success": False,
                    "error": "Failed to decode image"
                }

            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            faces = self.face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))

            face_count = len(faces)
            single_person = (face_count == 1)
            multiple_people = (face_count > 1)
            looking_away = False
            summary = "Candidate is focused on the screen."

            if face_count == 0:
                summary = "No candidate face detected in the webcam frame."
            elif face_count > 1:
                summary = f"Multiple people detected in the frame: found {face_count} faces."
            else:
                # Analyze eyes if exactly one face is detected
                (x, y, w, h) = faces[0]
                roi_gray = gray[y:y+h, x:x+w]
                eyes = self.eye_cascade.detectMultiScale(roi_gray, scaleFactor=1.1, minNeighbors=3, minSize=(10, 10))
                
                # If no eyes detected inside the face region, candidate might be looking away or eyes closed
                if len(eyes) < 2:
                    looking_away = True
                    summary = "Candidate is looking away from the monitor screen."

            return {
                "success": True,
                "single_person": single_person,
                "multiple_people": multiple_people,
                "looking_away": looking_away,
                "summary": summary,
                "face_count": face_count
            }

        except Exception as e:
            return {
                "success": False,
                "error": f"Internal analysis error: {str(e)}"
            }

if __name__ == "__main__":
    # Command line interface execution
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No base64 image data provided as argument"}))
        sys.exit(1)

    auditor = ProctorVisionAuditor()
    result = auditor.analyze_snapshot(sys.argv[1])
    print(json.dumps(result))
