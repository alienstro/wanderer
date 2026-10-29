-- The app has no 18+ characters now, so "Wrongly marked 18+" becomes "Sexual content". The old reports keep their rows.
ALTER TYPE "ReportReason" RENAME VALUE 'wrong_rating' TO 'sexual_content';
