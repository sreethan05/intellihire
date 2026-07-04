-- Clean up any duplicates first to avoid failure
DELETE FROM exam_questions a USING exam_questions b
WHERE a.id < b.id AND a.exam_id = b.exam_id AND a.question_id = b.question_id;

DELETE FROM exam_coding_questions a USING exam_coding_questions b
WHERE a.id < b.id AND a.exam_id = b.exam_id AND a.coding_question_id = b.coding_question_id;

-- Add UNIQUE constraints
ALTER TABLE exam_questions DROP CONSTRAINT IF EXISTS unique_exam_question;
ALTER TABLE exam_questions ADD CONSTRAINT unique_exam_question UNIQUE (exam_id, question_id);

ALTER TABLE exam_coding_questions DROP CONSTRAINT IF EXISTS unique_exam_coding_question;
ALTER TABLE exam_coding_questions ADD CONSTRAINT unique_exam_coding_question UNIQUE (exam_id, coding_question_id);
