namespace Silhouette.PatientGenerator
{
  using System;
  using System.Collections.Generic;
  using System.Globalization;
  using System.Text;
  using static Silhouette.PatientGenerator.Wound;

  public class Wound
  {
    public string Label => $"{Convert.ToChar('A' + this.Index - 1)}";
    public int Index { get; set; }
    public string AnatomicalSite { get; set; }
    
    public WoundClassification Classification { get; set; }

    public WoundProgressionStyle ProgressionStyle { get; set; }

    public List<WoundAssessment> WoundAssessments { get; set; }

    public List<VisitAssessment> VisitAssessments { get; set; }

    public enum WoundClassification
    {
      PressureUlcerUnstageableDressingDevice = 0,
      DeepTissueInjury,
      VenousUlcer,
      Diabetic,
      DrainageDevice,
      TraumaSuperficial,
      SkinGraft,
      ArterialInsufficiency,
      CancerousOther,
      CancerousFungatingLesion
    }

    public string WoundClassificationReadable
    {
      get
      {
        switch (this.Classification)
        {
          case WoundClassification.ArterialInsufficiency:
            return "Arterial insufficiency";
            break;
          case WoundClassification.CancerousFungatingLesion:
            return "Cancerous: Fungating lesion";
            break;
          case WoundClassification.CancerousOther:
            return "Cancerous: Other";
            break;
          case WoundClassification.DeepTissueInjury:
            return "Deep Tissue Injury";
            break;
          case WoundClassification.Diabetic:
            return "Diabetic";
            break;
          case WoundClassification.DrainageDevice:
              return "Drainage Device";
              break;
          case WoundClassification.PressureUlcerUnstageableDressingDevice:
              return "Pressure Ulcer: Unstageable(dressing/device)";
              break;
          case WoundClassification.SkinGraft:
              return "Skin graft";
              break;
          case WoundClassification.TraumaSuperficial:
              return "Trauma: Superficial";
              break;
          case WoundClassification.VenousUlcer:
              return "Venous Ulcer";
              break;
          default:
            return "Unknown";
        }
      }
    }

    public bool IsAtExtremity
    {
        get
        {
            if ((string.Compare(this.AnatomicalSite, "Upper Extremity; Finger; Left; Thumb",
                    StringComparison.InvariantCultureIgnoreCase) == 0) ||
                (string.Compare(this.AnatomicalSite, "Upper Extremity; Finger; Left; Index Finger",
                    StringComparison.InvariantCultureIgnoreCase) == 0) ||
                (string.Compare(this.AnatomicalSite, "Upper Extremity; Finger; Left; Middle Finger",
                    StringComparison.InvariantCultureIgnoreCase) == 0) ||
                (string.Compare(this.AnatomicalSite, "Upper Extremity; Finger; Left; Ring Finger",
                    StringComparison.InvariantCultureIgnoreCase) == 0) ||
                (string.Compare(this.AnatomicalSite, "Upper Extremity; Finger; Left; Little Finger",
                    StringComparison.InvariantCultureIgnoreCase) == 0) ||
                (string.Compare(this.AnatomicalSite, "Upper Extremity; Finger; Right; Thumb",
                    StringComparison.InvariantCultureIgnoreCase) == 0) ||
                (string.Compare(this.AnatomicalSite, "Upper Extremity; Finger; Right; Index Finger",
                    StringComparison.InvariantCultureIgnoreCase) == 0) ||
                (string.Compare(this.AnatomicalSite, "Upper Extremity; Finger; Right; Middle Finger",
                    StringComparison.InvariantCultureIgnoreCase) == 0) ||
                (string.Compare(this.AnatomicalSite, "Upper Extremity; Finger; Right; Ring Finger",
                    StringComparison.InvariantCultureIgnoreCase) == 0) ||
                (string.Compare(this.AnatomicalSite, "Upper Extremity; Finger; Right; Little Finger",
                    StringComparison.InvariantCultureIgnoreCase) == 0) ||
                (string.Compare(this.AnatomicalSite, "Lower Extremity; Toe; Left; Big",
                    StringComparison.InvariantCultureIgnoreCase) == 0) ||
                (string.Compare(this.AnatomicalSite, "Lower Extremity; Toe; Left; Second",
                    StringComparison.InvariantCultureIgnoreCase) == 0) ||
                (string.Compare(this.AnatomicalSite, "Lower Extremity; Toe; Left; Third",
                    StringComparison.InvariantCultureIgnoreCase) == 0) ||
                (string.Compare(this.AnatomicalSite, "Lower Extremity; Toe; Left; Fourth",
                    StringComparison.InvariantCultureIgnoreCase) == 0) ||
                (string.Compare(this.AnatomicalSite, "Lower Extremity; Toe; Left; Fifth",
                    StringComparison.InvariantCultureIgnoreCase) == 0) ||
                (string.Compare(this.AnatomicalSite, "Lower Extremity; Toe; Right; Big",
                    StringComparison.InvariantCultureIgnoreCase) == 0) ||
                (string.Compare(this.AnatomicalSite, "Lower Extremity; Toe; Right; Second",
                    StringComparison.InvariantCultureIgnoreCase) == 0) ||
                (string.Compare(this.AnatomicalSite, "Lower Extremity; Toe; Right; Third",
                    StringComparison.InvariantCultureIgnoreCase) == 0) ||
                (string.Compare(this.AnatomicalSite, "Lower Extremity; Toe; Right; Fourth",
                    StringComparison.InvariantCultureIgnoreCase) == 0) ||
                (string.Compare(this.AnatomicalSite, "Lower Extremity; Toe; Right; Fifth",
                    StringComparison.InvariantCultureIgnoreCase) == 0))
            {
                return true;
            }

            return false;
        }
    }

    // These need to be naturally numbered, random casted assignment from an int
    public enum WoundProgressionStyle
    {
      Unknown = 0,
      JaggedLinear,
      Exponential,
      JaggedFlat,
      NPTraditionalDisposable,
      NPDisposable,
    }
  }

  public class WoundGenerator
  {
    private CohortSpec Specs;
    
    private List<string> AnatomicalSites;

    private RandomHelpers.CumulativePDF WoundCountGenerator;
    private RandomHelpers.CumulativePDF WoundClassificationGenerator;
    private RandomHelpers.CumulativePDF WoundProgressionStyleGenerator;

    private Random Rnd;

    public WoundGenerator(CohortSpec specs, Random rnd = null)
    {
      this.Specs = specs;
      this.Rnd = rnd ?? new Random();

      this.AnatomicalSites = new List<string>();

      TextInfo textInfo = Thread.CurrentThread.CurrentCulture.TextInfo;
      string line;
      using (StreamReader reader = File.OpenText("config/AnatomicalSites.txt"))
      {
        while ((line = reader.ReadLine()) != null)
        {
          if (line.Length > 0) AnatomicalSites.Add(line);
        }
      }

      // Parse spec for various generators
      // in form "<cumulativeChance> <quantity>, ..."
      // e.g. "0.8:1,0.95:2,1.0:3" gives 80% chance of 1 wound, 15% 2 wounds, 5% 3 wounds

      this.WoundCountGenerator = new RandomHelpers.CumulativePDF(this.Specs.WoundCountStats, this.Rnd);
      this.WoundClassificationGenerator = new RandomHelpers.CumulativePDF(this.Specs.WoundClassificationDistribution, this.Rnd);
      this.WoundProgressionStyleGenerator = new RandomHelpers.CumulativePDF(this.Specs.WoundProgressionStyleDistribution, this.Rnd);
    }

    internal Wound Generate(int woundIndex)
    {
      var w = new Wound();

      w.Index = woundIndex;
      w.AnatomicalSite = this.AnatomicalSites[this.Rnd.Next(this.AnatomicalSites.Count)];

      // Randomly assign a wound classification (style)
      w.Classification = this.Specs.WoundClassifications[this.Rnd.Next(10)];
      
      // Randomly assign a wound progression style
      w.ProgressionStyle = this.Specs.WoundProgressionStyles[this.WoundProgressionStyleGenerator.Next()];

      return w;
    }

    public List<Wound> GenerateSet()
    {
      var woundSet = new List<Wound>();

      int woundCount = this.WoundCountGenerator.Next();

      for (int w = 1; w <= woundCount; w++)
      {
        var wound = this.Generate(w);
        woundSet.Add(wound);
      }

      return woundSet;
    }
  }
}
