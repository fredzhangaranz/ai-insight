namespace Silhouette.PatientGenerator
{
  public class RandomHelpers
  {
    public class CumulativePDF
    {
      private List<(double Chance, int Value)> ChancePairs;

      private Random Rnd;

      // in form "<cumulativeChance> <quantity>, ..."
      // e.g. "0.8:1,0.95:2,1.0:3" gives 80% chance of 1 wound, 15% 2 wounds, 5% 3 wounds
      public CumulativePDF(string spec, Random rnd = null)
      {
        this.Rnd = rnd ?? new Random();

        this.ChancePairs = new List<(double Chance, int Value)>();

        var pairs = spec.Split(',');
        foreach (var pair in pairs)
        {
          var parts = pair.Split(':');
          ChancePairs.Add((Convert.ToDouble(parts[0]), Convert.ToInt32(parts[1])));
        }

        // Reverse the list so the higher chance values are at the start (should probably sort it)
        ChancePairs.Reverse();
      }

      public int Next()
      {
        var r = Rnd.NextDouble();

        int v = 0;
        for (int c = 0; c < this.ChancePairs.Count; c++)
        {
          if (r < this.ChancePairs[c].Chance)
          {
            v = this.ChancePairs[c].Value;
          }
        }

        return v;
      }
    }
  }
}
