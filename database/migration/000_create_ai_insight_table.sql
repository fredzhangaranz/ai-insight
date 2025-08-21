-- AIInsights definition

-- Drop table

-- DROP TABLE AIInsights;

CREATE TABLE IF NOT EXISTS "AIInsights" (
	id SERIAL PRIMARY KEY,
	"assessmentFormVersionFk" UUID NOT NULL,
	"insightsJson" JSONB NOT NULL,
	"generatedDate" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
	"generatedBy" VARCHAR(255) NOT NULL,
	CONSTRAINT "UQ_AIInsights_AssessmentFormVersionFk" UNIQUE ("assessmentFormVersionFk")
);

-- Add comments to the table and columns
COMMENT ON TABLE "AIInsights" IS 'Stores AI-generated insights for assessment form versions.';
COMMENT ON COLUMN "AIInsights".id IS 'The unique identifier for the insight record.';
COMMENT ON COLUMN "AIInsights"."assessmentFormVersionFk" IS 'Foreign key to the assessment form version (validated at application level).';
COMMENT ON COLUMN "AIInsights"."insightsJson" IS 'The JSON object containing the AI-generated insights.';
COMMENT ON COLUMN "AIInsights"."generatedDate" IS 'The UTC timestamp when the insight was generated.';
COMMENT ON COLUMN "AIInsights"."generatedBy" IS 'The AI model or user that generated the insight.';

-- Note: Foreign key constraint to SilhouetteAIDashboard.dbo.AssessmentTypeVersion(id) 
-- is not included because AssessmentTypeVersion is in an external database.
-- The relationship is validated at the application level when inserting/updating records.