
namespace Silhouette.PatientGenerator
{
  using Newtonsoft.Json;
  using System;

  public class CohortSpec
  {
    public int PatientCount;
    public int PatientMinAge;
    public int PatientMaxAge;

    public string WoundCountStats;

    public List<Wound.WoundClassification> WoundClassifications;
    public string WoundClassificationDistribution;

    public List<Wound.WoundProgressionStyle> WoundProgressionStyles;
    public string WoundProgressionStyleDistribution;

    public int AssessmentNominalDaysDelta;
    public int AssessmentMaximumDaysBeforeToday;
    public int AssessmentMinimumDeltaMonths;
    public string AssessmentTimeWobble;
    public string AssessmentAttended;
    
    public double WoundBaselineAreaMin;
    public double WoundBaselineAreaMax;
    public double WoundAreaConsideredHealed;

    public string CreateVisitAssessment;

        [JsonIgnore]
    public DateOnly AssessmentMaximumDate
    {
      get
      {
        return DateOnly.FromDateTime(DateTime.Now).AddDays(-this.AssessmentMaximumDaysBeforeToday);
      }
    }

    [JsonIgnore]
    public DateOnly AssessmentMinimumDate
    {
      get
      {
        return this.AssessmentMaximumDate.AddMonths(-this.AssessmentMinimumDeltaMonths);
      }
    }
  }
}
