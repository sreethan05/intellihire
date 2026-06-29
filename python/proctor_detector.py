#!/usr/bin/env python3
"""
IntelliHire Proctoring Gaze and Face Detector Utility.
Uses OpenCV and Haar Cascades to analyze webcam feeds for proctoring checks.
Detects candidate gaze direction, head movement, and multiple faces.
"""

import sys
import time

try:
    import cv2
    import numpy as np
    HAS_OPENCV = True
except ImportError:
    HAS_OPENCV = False

class ProctorDetector:
    def __init__(self, face_cascade_path=None, eye_cascade_path=None):
        self.has_resources = HAS_OPENCV
        if not HAS_OPENCV:
            print("[Warning] OpenCV or NumPy not installed. Running in mock mode.")
            return

        # Load default Haar cascades
        self.face_cascade = cv2.CascadeClassifier(
            face_cascade_path or cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        )
        self.eye_cascade = cv2.CascadeClassifier(
            eye_cascade_path or cv2.data.haarcascades + 'haarcascade_eye.xml'
        )

    def analyze_frame(self, frame):
        """
        Analyzes a single webcam frame for violations.
        Returns:
            dict: {
                "face_count": int,
                "gaze_direction": str ("center", "left", "right", "unknown"),
                "violations": list of str
            }
        """
        if not self.has_resources:
            # Mock analysis for testing/deployment environment where OpenCV isn't available
            return {
                "face_count": 1,
                "gaze_direction": "center",
                "violations": []
            }

        violations = []
        gaze = "unknown"
        
        # Convert to grayscale
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # Detect faces
        faces = self.face_cascade.detectMultiScale(gray, 1.3, 5)
        face_count = len(faces)

        if face_count == 0:
            violations.append("NO_FACE_DETECTED")
        elif face_count > 1:
            violations.append("MULTIPLE_FACES_DETECTED")
        else:
            # One face detected, check eyes for gaze direction
            x, y, w, h = faces[0]
            roi_gray = gray[y:y+h, x:x+w]
            
            # Detect eyes within the face ROI
            eyes = self.eye_cascade.detectMultiScale(roi_gray, 1.1, 3)
            
            if len(eyes) < 2:
                violations.append("CANDIDATE_LOOKING_AWAY")
                gaze = "away"
            else:
                # Basic gaze heuristics based on eye bounding boxes relative to face width
                eye_centers = []
                for (ex, ey, ew, eh) in eyes:
                    eye_centers.append(ex + ew/2)
                
                if len(eye_centers) >= 2:
                    eye_centers.sort()
                    left_eye_center = eye_centers[0]
                    right_eye_center = eye_centers[1]
                    
                    # Normalize positions relative to face width
                    rel_center = (left_eye_center + right_eye_center) / (2 * w)
                    
                    if rel_center < 0.45:
                        gaze = "left"
                        violations.append("SUSPICIOUS_LEFT_GAZE")
                    elif rel_center > 0.55:
                        gaze = "right"
                        violations.append("SUSPICIOUS_RIGHT_GAZE")
                    else:
                        gaze = "center"

        return {
            "face_count": face_count,
            "gaze_direction": gaze,
            "violations": violations
        }

    def process_video_stream(self, camera_index=0):
        """
        Runs the proctor detector in real-time on a local camera feed (for demo purposes).
        """
        if not self.has_resources:
            print("[Error] Cannot run live feed without OpenCV installed.")
            return

        cap = cv2.VideoCapture(camera_index)
        if not cap.isOpened():
            print(f"[Error] Could not open camera source at index {camera_index}")
            return

        print("Press 'q' to quit the proctoring demo stream.")
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            results = self.analyze_frame(frame)
            
            # Draw overlay annotations
            for (x, y, w, h) in self.face_cascade.detectMultiScale(frame, 1.3, 5):
                color = (0, 255, 0) if len(results["violations"]) == 0 else (0, 0, 255)
                cv2.rectangle(frame, (x, y), (x+w, y+h), color, 2)
                
                # Annotate status on frame
                status_text = f"Face Count: {results['face_count']} | Gaze: {results['gaze_direction']}"
                cv2.putText(frame, status_text, (x, y-10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

            if results["violations"]:
                v_text = f"VIOLATIONS: {', '.join(results['violations'])}"
                cv2.putText(frame, v_text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
            else:
                cv2.putText(frame, "STATUS: SECURE", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

            cv2.imshow("IntelliHire Live Proctoring Monitor", frame)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

        cap.release()
        cv2.destroyAllWindows()

if __name__ == "__main__":
    detector = ProctorDetector()
    if len(sys.argv) > 1 and sys.argv[1] == "--demo":
        detector.process_video_stream()
    else:
        print("IntelliHire Proctoring engine loaded successfully.")
        print("Run with '--demo' flag to launch camera stream (requires OpenCV and web camera).")
        # Self-test validation
        dummy_result = detector.analyze_frame(None)
        print("Self-test check status:", dummy_result)
