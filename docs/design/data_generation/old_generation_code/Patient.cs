namespace Silhouette.PatientGenerator
{
  using System;
  using System.Collections.Generic;

  public enum Gender
  {
    Unknown,
    Male,
    Female
  }

  public class Patient
  {
    public string FirstName { get; set; }
    public string MiddleName { get; set; }
    public string LastName { get; set; }
    public string ID { get; set; }
    public DateOnly DateOfBirth { get; set; }
    public Gender Gender { get; set; }

    public List<Wound> Wounds { get; set; }

    public string FullName
    {
      get
      {
        return this.FirstName + " " + this.MiddleName + " " + this.LastName;
      }
    }

    public Patient()
    {
      this.Wounds = new List<Wound>();
    }
  }

  public class PatientGenerator
  {
    private readonly CohortSpec Specs;
    //private (int Min, int Max) AgeRange;

    private List<string> Surnames = new List<string>();
    private List<string> FemaleNames = new List<string>();
    private List<string> MaleNames = new List<string>();

    private Random Rnd;
    private List<int> patientIds = new List<int>();

    public PatientGenerator(CohortSpec specs, Random rnd = null)
    {
      this.Specs = specs;

      this.Rnd = rnd ?? new Random();

      this.Surnames = LoadNames("config/NamesSurname.txt");
      this.FemaleNames = LoadNames("config/NamesFemale.txt");
      this.MaleNames = LoadNames("config/NamesMale.txt");
    }

    public Patient Generate()
    {
      var p = new Patient();

      p.Gender = this.Rnd.NextDouble() < 0.5 ? Gender.Male : Gender.Female;

      p.FirstName = p.Gender == Gender.Male ? MaleNames[this.Rnd.Next(MaleNames.Count)] : FemaleNames[this.Rnd.Next(FemaleNames.Count)];
      p.MiddleName = p.Gender == Gender.Male ? MaleNames[this.Rnd.Next(MaleNames.Count)] : FemaleNames[this.Rnd.Next(FemaleNames.Count)];
      p.LastName = Surnames[this.Rnd.Next(Surnames.Count)];


      int patId = this.Rnd.Next(100000, 1000000);
      while (patientIds.Contains(patId))
      {
        patId = this.Rnd.Next(100000, 1000000);
      }

      patientIds.Add(patId);
      // ID is DASH + 6 random digits
      p.ID = $"DASH{patId}";

      // Born sometime between specs.AgeRange.Max and specs.AgeRange.Min years ago
      var oldest = DateTime.Now.AddYears(-this.Specs.PatientMaxAge);
      var youngest = DateTime.Now.AddYears(-this.Specs.PatientMinAge);
      var ageRange = Convert.ToInt32(Math.Round((youngest - oldest).TotalDays));
      p.DateOfBirth = DateOnly.FromDateTime(oldest).AddDays(this.Rnd.Next(ageRange));

      return p;
    }

    private List<string> LoadNames(string filename)
    {
      var names = new List<string>();

      string line;
      using (StreamReader reader = File.OpenText(filename))
      {
        while ((line = reader.ReadLine()) != null)
        {
          if (line.Length > 0) names.Add(Thread.CurrentThread.CurrentCulture.TextInfo.ToTitleCase(line.ToLower()));
        }
      }

      return names;
    }
  }
}
