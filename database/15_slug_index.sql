-- 15. Create Unique Index on Candidate Profile Public Portfolio Slug
CREATE UNIQUE INDEX IF NOT EXISTS idx_candidate_profiles_portfolio_slug
ON candidate_profiles(public_portfolio_slug)
WHERE public_portfolio_slug IS NOT NULL;
