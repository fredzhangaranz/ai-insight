namespace Silhouette.PatientGenerator
{
  using Serilog;
  using System;
  using System.Collections.Generic;
  using System.Linq;

  public class WoundAssessment
  {
    public DateTime DateTime { get; set; }
    public double WoundArea { get; set; }
    public double WoundPerimeter { get; set; }

    public bool IsHealed { get; set; }
    public bool IsAmputated { get; set; }
    public bool IsReleased { get; set; }

    public string WoundState
    {
        get => IsHealed ? "Healed" : IsAmputated ? "Amputated" : IsReleased ? "Released from follow-up" : "Open";
    }

    public bool IsBaseline { get; set; }

    public int DaysSinceBaseline { get; set; }

    public string Treatment { get; set; }
  }

  public class VisitAssessment
  {
      public DateTime DateTime { get; set; }
  }

  public class AssessmentGenerator
  {
    private Random Rnd;
    readonly CohortSpec Specs;

    public AssessmentGenerator(CohortSpec specs, Random rnd = null)
    {
      this.Specs = specs;
      this.Rnd = rnd ?? new Random();
    }

    public (List<WoundAssessment>, List<VisitAssessment>) GenerateSet(Wound wound)
    {
        var woundAssessmentSet = new List<WoundAssessment>();
      var visitAssessmentSet = new List<VisitAssessment>();

      // In general we want a wound that starts at a baseline assessment and then heals slowly with regular assessments
      // Some wobble is applied to the timing of each assessment, also with a chance of missing the assessment entirely
      // Measurements 

      var assessmentTimeWobbleGenerator = new RandomHelpers.CumulativePDF(this.Specs.AssessmentTimeWobble, this.Rnd);
      var assessmentAttendedGenerator = new RandomHelpers.CumulativePDF(this.Specs.AssessmentAttended, this.Rnd);
      var createVisitAssessmentGenerator = new RandomHelpers.CumulativePDF(this.Specs.CreateVisitAssessment, this.Rnd);

      // Start with weekly assessments up to the Specs.AssessmentMaximumDate
      // Baseline assessment date is between Specs.WoundStartDate and Specs.AssessmentMaximumDate

      var daySpread = this.Specs.AssessmentMaximumDate.DayNumber - this.Specs.AssessmentMinimumDate.DayNumber;

      var dayStartRnd = Rnd.Next(daySpread);
      var setStartDate = this.Specs.AssessmentMinimumDate.AddDays(dayStartRnd);

      // Wound area start a random value between specs, then decreases each assessment
      var baselineArea = (this.Specs.WoundBaselineAreaMax - this.Specs.WoundBaselineAreaMin) * Rnd.NextDouble() + this.Specs.WoundBaselineAreaMin;
     
      bool addMore = true;
      int a = 0;
      while (addMore)
      {
        bool isHealed = false;
        bool isAmputated = false;
        bool isReleased = false;

        var time = new TimeOnly(Rnd.Next(12) + 7, Rnd.Next(60), Rnd.Next(60));

        // No wobble of baseline date
        var assessmentTimeWobble = a == 0 ? 0 : assessmentTimeWobbleGenerator.Next();
        var date = setStartDate.AddDays(a * this.Specs.AssessmentNominalDaysDelta + assessmentTimeWobble);
        var dateTime = date.ToDateTime(time);
        var daysSinceBaseline = date.DayNumber - setStartDate.DayNumber;

        if (dateTime.Date > this.Specs.AssessmentMaximumDate.ToDateTime(new TimeOnly()))
        {
          break;
        }

        var area = baselineArea;
        var treatment = "Simple Bandage";
        if (a > 0)
        {
          switch (wound.ProgressionStyle)
          {
            case Wound.WoundProgressionStyle.JaggedLinear:
              area = MeasurementJaggedLinear();
              break;
            case Wound.WoundProgressionStyle.Exponential:
              area = MeasurementExponential();
              break;
            case Wound.WoundProgressionStyle.JaggedFlat:
              area = MeasurementJaggedFlat();

              // After 15 weeks, 25% chance of increasing healing rate to linear
              if (daysSinceBaseline > 7 * 15 & Rnd.NextDouble() < 0.25)
              {
                area = MeasurementJaggedLinear();
              }

              break;
            case Wound.WoundProgressionStyle.NPTraditionalDisposable:

              if (daysSinceBaseline < 50)
              {
                treatment = "Simple Bandage";
                area = MeasurementJaggedFlat();
              }
              else if (daysSinceBaseline < 75)
              {
                treatment = "Traditional Negative Pressure";
                area = MeasurementExponential();
              }
              else if (daysSinceBaseline < 110)
              {
                treatment = "Disposable Negative Pressure";
                area = MeasurementJaggedLinear();
              }
              else
              {
                treatment = "Simple Bandage";
                area = MeasurementJaggedLinear();
              }

              break;
            case Wound.WoundProgressionStyle.NPDisposable:

              if (daysSinceBaseline < 30)
              {
                treatment = "Simple Bandage";
                area = MeasurementJaggedFlat();
              }
              else if (daysSinceBaseline < 75)
              {
                treatment = "Disposable Negative Pressure";
                area = MeasurementJaggedLinear();
              }
              else
              {
                treatment = "Simple Bandage";
                area = MeasurementJaggedLinear();
              }

              break;
            default:
              Log.Error("Mismatch in wound measurement progression style");
              break;
          }

          // Call a small wound under spec limit healed
          if (area <= this.Specs.WoundAreaConsideredHealed)
          {
              area = 0.0;
              isHealed = true;
              isAmputated = false;
              isReleased = false;
              addMore = false;
          }
          else if (wound.IsAtExtremity && Rnd.NextDouble() < 0.025)
          {
              isHealed = false;
              isAmputated = true;
              isReleased = false;
              addMore = false;
          }
          else if (!wound.IsAtExtremity && Rnd.NextDouble() < 0.10)
          {
              isHealed = false;
              isAmputated = false;
              isReleased = true;
              addMore = false;
          }
        }

        // Generate a perimeter based on a circle, then random mult by 1.0..1.5
        var circlePerimeter = Math.Sqrt(4 * Math.PI * area);
        var perimeter = circlePerimeter * ((Rnd.NextDouble() * 0.5) + 1.0);

        if (createVisitAssessmentGenerator.Next() == 1)
        {
          visitAssessmentSet.Add(new VisitAssessment { DateTime = dateTime });
        }

        // Chance of ignoring the assessment, but always keep the baseline or assessments marked as healed/released/amputated
        if (assessmentAttendedGenerator.Next() == 1 || a == 0 || isHealed || isReleased || isAmputated)
        {
          woundAssessmentSet.Add(new WoundAssessment
          {
            DateTime = dateTime,
            DaysSinceBaseline = daysSinceBaseline,
            WoundArea = area,
            WoundPerimeter = perimeter,
            IsBaseline = a == 0,
            IsHealed = isHealed,
            IsAmputated = isAmputated,
            IsReleased = isReleased,
            Treatment = treatment,
          });
        }

        a++;
      }

      return (woundAssessmentSet, visitAssessmentSet);

      double MeasurementExponential()
      {
        // Exponential based on baseline, area +5% to -30% of baseline applied to current
        var exponentialDecreaseFactor = -0.05 + (Rnd.NextDouble() * 0.35);
        var areaDecrease = woundAssessmentSet.First().WoundArea * exponentialDecreaseFactor;
        var area = woundAssessmentSet.Last().WoundArea - areaDecrease;

        return area;
      }

      double MeasurementJaggedLinear()
      {
        // Decrease amount is between -5 and +33% of baseline area
        var linearDecreaseDelta = (Rnd.NextDouble() * (0.33 - -0.05)) + -0.05;

        var area = woundAssessmentSet.Last().WoundArea - (linearDecreaseDelta * baselineArea);
        
        //var area = Math.Max((1.0 - (linearDecreaseDelta * a)) * baselineArea, 0.0);

        return area;
      }

      double MeasurementJaggedFlat()
      {
        // Remains centered on baseline, but wobbles up and down a bit
        var delta = ((Rnd.NextDouble() * 0.2) - 0.1) * baselineArea;
        var area = woundAssessmentSet.Last().WoundArea + delta;

        return area;
      }
    }
  }
}
