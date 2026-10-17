-- Mã số đề tài <năm>-<mã đơn vị chủ trì>-<số thứ tự>: từ nay cấp khi hồ sơ được nộp lần đầu (proposal-code.ts).
-- Cấp bù cho hồ sơ đã nộp trước đó, theo thứ tự lần nộp đầu tiên trong từng đơn vị và năm (giờ Việt Nam),
-- rồi đặt bộ đếm để mã cấp sau không trùng.
CREATE TEMP TABLE proposal_code_backfill AS
WITH first_submission AS (
  SELECT p.id, u.code AS unit_code,
         COALESCE(
           (SELECT MIN(e.submitted_at) FROM proposal_submission_events e WHERE e.proposal_id = p.id AND e.to_status = 'submitted'),
           p.submitted_at
         ) AS submitted_at
  FROM research_proposals p
  JOIN organization_units u ON u.id = p.host_organization_unit_id
  WHERE p.code IS NULL AND p.submitted_at IS NOT NULL
), dated AS (
  SELECT id, unit_code, submitted_at,
         EXTRACT(YEAR FROM (submitted_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh'))::int AS year
  FROM first_submission
)
SELECT id, unit_code, year,
       ROW_NUMBER() OVER (PARTITION BY unit_code, year ORDER BY submitted_at, id)::int AS sequence
FROM dated;

UPDATE research_proposals p
SET code = b.year || '-' || b.unit_code || '-' || lpad(b.sequence::text, 3, '0')
FROM proposal_code_backfill b
WHERE p.id = b.id;

INSERT INTO document_number_counters (scope, year, last_value)
SELECT 'proposal-code:' || unit_code, year, MAX(sequence)
FROM proposal_code_backfill
GROUP BY unit_code, year
ON CONFLICT (scope, year) DO UPDATE SET last_value = GREATEST(document_number_counters.last_value, EXCLUDED.last_value);

-- Đề tài kế thừa mã của hồ sơ nguồn.
UPDATE approved_projects ap
SET code = p.code
FROM research_proposals p
WHERE ap.proposal_id = p.id
  AND ap.code IS NULL
  AND p.code IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM approved_projects other WHERE other.code = p.code);

DROP TABLE proposal_code_backfill;
