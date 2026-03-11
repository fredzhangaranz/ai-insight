namespace SilhouetteTools.PatientGenerator
{
  using System;
  using CommandLine;
  using Newtonsoft.Json;
  using Serilog;
  using Silhouette.PatientGenerator;
  
  class SilhouettePatientGenerator
  {
    internal class CmdLineOptions
    {
      [Option('i', "spec", Required = false, Default= "config\\cohort.json", HelpText = "Specifications file to load.")]
      public string SpecFile { get; set; }

      [Option('o', "outdir", Required = false, Default = "output", HelpText = "Directory to create output within. Default <output>")]
      public string OutDir { get; set; }

      public CmdLineOptions()
      {
        SpecFile = string.Empty;
      }
    }

    static void Main(string[] args)
    {
      Log.Logger = new LoggerConfiguration()
                     .MinimumLevel.Debug()
                     .WriteTo.Debug()
                     .WriteTo.Console()
                     .WriteTo.File("logs/SilhouettePatientGenerator.log", rollingInterval: RollingInterval.Day)
                     .CreateLogger();

      Log.Information("Silhouette Patient Generator");

      CmdLineOptions opts = new CmdLineOptions();
      Parser.Default.ParseArguments<CmdLineOptions>(args)
        .WithParsed<CmdLineOptions>(o =>
        {
          opts = o;
        })
        .WithNotParsed(errs =>
        {
          Environment.Exit(-1);
        });

      Log.Information($"Spec file: {opts.SpecFile}");
      Log.Information($"Output dir: {opts.OutDir}");

      if (Directory.Exists(opts.OutDir))
      {
        Directory.Delete(opts.OutDir, true);
      }
      Directory.CreateDirectory(opts.OutDir);

      // Parse the spec file
      var json = File.ReadAllText(opts.SpecFile);
      CohortSpec config = JsonConvert.DeserializeObject<CohortSpec>(json);

      var patients = new List<Patient>();

      var rnd = new Random(12345);
      var patientGenerator = new PatientGenerator(config, rnd);
      
      for (int i = 0; i < config.PatientCount; i++)
      {
        var p = patientGenerator.Generate();

        // Use the patient ID as the random seed in the hope of being able to reproduce datasets
        var woundGenerator = new WoundGenerator(config, new Random(GetDeterministicHashCode(p.ID)));
        var assessmentGenerator = new AssessmentGenerator(config, new Random(GetDeterministicHashCode(p.ID)));

        p.Wounds = woundGenerator.GenerateSet();
        
        for (int w = 0; w < p.Wounds.Count; w++)
        {
          (p.Wounds[w].WoundAssessments, p.Wounds[w].VisitAssessments) = assessmentGenerator.GenerateSet(p.Wounds[w]);
        }

        patients.Add(p);
      }

      // Export everything
      Export.ExportSql(Path.Combine(opts.OutDir, "PatientData.sql"), patients);
      Export.ExportCSV(Path.Combine(opts.OutDir, "PatientData.csv"), patients);
    }

    static int GetDeterministicHashCode(string str)
    {
      unchecked
      {
        int hash1 = (5381 << 16) + 5381;
        int hash2 = hash1;

        for (int i = 0; i < str.Length; i += 2)
        {
          hash1 = ((hash1 << 5) + hash1) ^ str[i];
          if (i == str.Length - 1)
            break;
          hash2 = ((hash2 << 5) + hash2) ^ str[i + 1];
        }

        return hash1 + (hash2 * 1566083941);
      }
    }
  }
}
