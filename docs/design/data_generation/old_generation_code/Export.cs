namespace Silhouette.PatientGenerator
{
  using System.Collections.Generic;
  using System.Text;

  public static class Export
  {
    private static DateTime UtcNowInstance;
    
    public static void ExportCSV(string filename, List<Patient> patients)
    {
      using (var sw = new StreamWriter(filename))
      {
        var sb = new StringBuilder();
        sb.Append("ID,FirstName,MiddleName,LastName,Gender,DateOfBirth");
        sb.Append(",WoundLabel,AnatomicalSite,WoundClassification");
        sb.Append(",AssessmentDateTime,DaysSinceBaseline,WoundArea,WoundPerimeter,IsBaseline,IsHealed,Treatment");
        // Add debug values
        sb.Append(",DebugWoundProgressionStyle");

        sw.WriteLine(sb.ToString());

        foreach (var p in patients)
        {
          foreach (var w in p.Wounds)
          {
            foreach (var a in w.WoundAssessments)
            {
              sb.Clear();
              sb.Append($"{p.ID},{p.FirstName},{p.MiddleName},{p.LastName},{p.Gender},{p.DateOfBirth.ToString()}");
              sb.Append($",{w.Label},{w.AnatomicalSite},{w.WoundClassificationReadable}");
              sb.Append($",{a.DateTime},{a.DaysSinceBaseline},{a.WoundArea},{a.WoundPerimeter},{a.IsBaseline},{a.IsHealed},{a.Treatment}");

              // Debug items
              sb.Append($",{w.ProgressionStyle.ToString()}");

              sw.WriteLine(sb.ToString());
            }
          }
        }
      }
    }

    public static void ExportSql(string filename, IEnumerable<Patient> patients)
    {
      UtcNowInstance = DateTime.UtcNow.Date;

      using (var writer = new StreamWriter(filename))
      {
        writer.WriteNowVariable();
        writer.WriteDashboardUnit();
        writer.WriteDashboardRoleAndUsers();
        writer.WriteAnatomiesLookup();
        writer.WriteWoundStateLookup();
        writer.WriteIdVariables();

        var rnd = new Random();
        foreach (var patient in patients)
        {
          var staffUserNUmber = rnd.Next(4);
          writer.WritePatient(patient, staffUserNUmber);
        }
      }
    }

    public static void WriteNowVariable(this StreamWriter writer)
    {
      writer.WriteLine("SET QUOTED_IDENTIFIER ON");
      writer.WriteLine();
      writer.WriteLine("DECLARE @now DATETIME = GETUTCDATE()");
      writer.WriteLine();
    }

    private static void WriteDashboardUnit(this StreamWriter writer)
    {
      writer.WriteLine();
      writer.WriteLine(@"DECLARE @unitId UNIQUEIDENTIFIER");
      writer.WriteLine(@"SELECT TOP 1 @unitId = id FROM dbo.Unit WHERE isDeleted = 0 and name = 'Dashboard Unit'");
      writer.WriteLine(@"IF (@unitId is null)");
      writer.WriteLine(@"BEGIN");
      writer.WriteLine(@"SET @unitId = NEWID()");
      writer.WriteLine(@"INSERT into dbo.Unit (id, name) VALUES (@unitId, 'Dashboard Unit')");
      writer.WriteLine(@"END");
    }

    private static void WriteDashboardRoleAndUsers(this StreamWriter writer)
    {
        writer.WriteLine();
        writer.WriteLine(@"DECLARE @roleId UNIQUEIDENTIFIER");
        writer.WriteLine(@"Declare @staffUser1 Uniqueidentifier");
        writer.WriteLine(@"Declare @staffUser2 Uniqueidentifier");
        writer.WriteLine(@"Declare @staffUser3 Uniqueidentifier");
        writer.WriteLine(@"SELECT TOP 1 @roleId = id FROM dbo.Role WHERE isDeleted = 0 and name = 'Provider'");

        writer.WriteLine(@"IF (@roleId is null)");
        writer.WriteLine(@"BEGIN");
        writer.WriteLine(@"SET @roleId = NEWID()");
        writer.WriteLine(@"INSERT into dbo.Role (id, name) VALUES (@roleId, 'Provider')");
        writer.WriteLine(@"SET @staffUser1 = NEWID();");
        writer.WriteLine(@"SET @staffUser2 = NEWID();");
        writer.WriteLine(@"SET @staffUser3 = NEWID();");
        writer.WriteLine(@"INSERT into dbo.StaffUser (id, login, firstName, lastName, medicalCredentials) VALUES");
        writer.WriteLine(@"(@staffUser1, 'ewilliams', 'Emma', 'Williams', 'RN'),");
        writer.WriteLine(@"(@staffUser2, 'ajones', 'Ava', 'Jones', 'FNP'),");
        writer.WriteLine(@"(@staffUser3, 'mrobbins', 'Mia', 'Robbins', 'FNP-RC')");
        writer.WriteLine(@"INSERT into dbo.StaffUserRole (id, staffUserFk, roleFk) VALUES");
        writer.WriteLine(@"(NEWID(), @staffUser1, @roleId),");
        writer.WriteLine(@"(NEWID(), @staffUser2, @roleId),");
        writer.WriteLine(@"(NEWID(), @staffUser3, @roleId)");
        writer.WriteLine(@"Declare @accessGroup Uniqueidentifier");
        writer.WriteLine(@"SELECT TOP 1 @accessGroup = id FROM dbo.AccessGroup WHERE isDeleted = 0 and name = 'All Access'");
        writer.WriteLine(@"INSERT INTO dbo.StaffUserAccessGroup (id, staffUserFk, accessGroupFk) VALUES");
        writer.WriteLine(@"(NEWID(), @staffUser1, @accessGroup),");
        writer.WriteLine(@"(NEWID(), @staffUser2, @accessGroup),");
        writer.WriteLine(@"(NEWID(), @staffUser3, @accessGroup)");
        writer.WriteLine(@"END");

        writer.WriteLine(@"ELSE");
        writer.WriteLine(@"BEGIN");
        writer.WriteLine(@"Select top 1 @staffUser1 = id from dbo.StaffUser where login = 'ewilliams' and isDeleted = 0");
        writer.WriteLine(@"Select top 1 @staffUser2 = id from dbo.StaffUser where login = 'ajones' and isDeleted = 0");
        writer.WriteLine(@"Select top 1 @staffUser3 = id from dbo.StaffUser where login = 'mrobbins' and isDeleted = 0");
        writer.WriteLine(@"END");
    }

        private static void WriteAnatomiesLookup(this StreamWriter writer)
    {
      writer.WriteLine("DECLARE @anatomies TABLE ( [Name] VARCHAR(1024), Id UNIQUEIDENTIFIER );");
      writer.WriteLine("INSERT INTO @anatomies");
      writer.WriteLine(@"SELECT  LOWER('' + a0.[text] + '; ' + a1.[text] + '; ' + a2.[text] + IIF(a3.[text] IS NULL, '', '; ' + a3.[text])) AS [Name], COALESCE(a3.id, a2.id) AS [Id]
FROM    dbo.Anatomy a0
INNER JOIN  dbo.Anatomy a1 ON a0.id = a1.parentId AND a0.[level] = 0
INNER JOIN  dbo.Anatomy a2 ON a1.id = a2.parentId
LEFT OUTER JOIN dbo.Anatomy a3 ON a2.id = a3.parentId
ORDER BY a0.sortOrder, a1.sortOrder, a2.sortOrder, a3.sortOrder");
      writer.WriteLine();
    }
    
    private static void WriteWoundStateLookup(this StreamWriter writer)
    {
      writer.WriteLine(@"DECLARE @woundStateAssessmentTypeVersionId UNIQUEIDENTIFIER;
DECLARE @woundStateLookupAttributeTypeId UNIQUEIDENTIFIER;");
      writer.WriteLine(@"SELECT  TOP 1 @woundStateAssessmentTypeVersionId = atv.id, @woundStateLookupAttributeTypeId = att.id
FROM    dbo.AssessmentType ast
INNER JOIN  dbo.AssessmentTypeVersion atv ON ast.id = atv.assessmentTypeFk
INNER JOIN  dbo.AttributeSetAssessmentTypeVersion asatv ON atv.id = asatv.assessmentTypeVersionFk
INNER JOIN  dbo.AttributeSet ase ON asatv.attributeSetFk = ase.id
INNER JOIN  dbo.AttributeType att ON ase.attributeSetKey = att.attributeSetFk
WHERE   ast.id = 'CE64FA35-9CC6-4D6A-9A7B-C97761681EFC'
        AND att.attributeTypeKey = '56A71C1C-214E-46AD-8A74-BB735AB87B39'
ORDER BY  atv.definitionVersion DESC;");
      writer.WriteLine();
      writer.WriteLine("DECLARE @woundStateLookup TABLE ( [state] NVARCHAR(255), lookupId UNIQUEIDENTIFIER )");
      writer.WriteLine(@"INSERT INTO @woundStateLookup
SELECT  al.[text], al.id
FROM    dbo.AttributeLookup al 
WHERE   al.attributeTypeFk = @woundStateLookupAttributeTypeId
        AND al.[text] IN ( 'Open', 'Healed', 'Amputated', 'Released from Follow-up')");
      writer.WriteLine();
    }

    private static void WriteIdVariables(this StreamWriter writer)
    {
      writer.WriteLine(@"DECLARE @woundAssessmentTypeVersionId UNIQUEIDENTIFIER;
SELECT TOP 1 @woundAssessmentTypeVersionId = id FROM dbo.AssessmentTypeVersion WHERE [name] = 'Wound Assessment' ORDER BY definitionVersion DESC");
      writer.WriteLine(@"DECLARE @visitAssessmentTypeVersionId UNIQUEIDENTIFIER;
SELECT TOP 1 @visitAssessmentTypeVersionId = id FROM dbo.AssessmentTypeVersion WHERE [name] = 'Visit Assessment' ORDER BY definitionVersion DESC");
            writer.WriteLine();
      writer.WriteLine(@"DECLARE @woundImagesAttributeTypeId UNIQUEIDENTIFIER;
SELECT  TOP 1 @woundImagesAttributeTypeId = att.id
FROM    dbo.AssessmentTypeVersion atv
INNER JOIN  dbo.AttributeSetAssessmentTypeVersion asatv ON atv.id = asatv.assessmentTypeVersionFk
INNER JOIN  dbo.AttributeSet ats ON asatv.attributeSetFk = ats.id
INNER JOIN  dbo.AttributeType att ON ats.id = att.attributeSetFk AND att.dataType = 1004
WHERE   atv.id = @woundAssessmentTypeVersionId
ORDER BY  att.orderIndex ASC");

      writer.WriteLine(@"DECLARE @etiologyAttributeTypeId UNIQUEIDENTIFIER;
SELECT  TOP 1 @etiologyAttributeTypeId = att.id
FROM    dbo.AssessmentTypeVersion atv
INNER JOIN  dbo.AttributeSetAssessmentTypeVersion asatv ON atv.id = asatv.assessmentTypeVersionFk
INNER JOIN  dbo.AttributeSet ats ON asatv.attributeSetFk = ats.id
INNER JOIN  dbo.AttributeType att ON ats.id = att.attributeSetFk AND att.dataType = 1000 and att.name='Etiology'
WHERE   atv.id = @woundAssessmentTypeVersionId
ORDER BY atv.definitionVersion DESC");

            writer.WriteLine();
      writer.WriteLine(@"--DECLARE @woundTypeAttributeTypeId UNIQUEIDENTIFIER = '79fc0ea7-8ccb-4af4-963d-26c5e2a298c5';
--DECLARE @treatmentTypeAttributeTypeId UNIQUEIDENTIFIER = '0f2075aa-73f0-41d2-baa6-063f67513544';");
      writer.WriteLine();
      writer.WriteLine(@"DECLARE @patientDetailsVersionId UNIQUEIDENTIFIER;
SELECT  TOP 1 @patientDetailsVersionId = id
FROM    dbo.AssessmentTypeVersion 
WHERE   assessmentTypeFk = '0B482D93-8013-4D78-A521-CBC2D8E8DED7'
ORDER BY  definitionVersion DESC;");
      writer.WriteLine();

      writer.WriteLine(@"DECLARE @auditLogActionId UNIQUEIDENTIFIER;");
      writer.WriteLine(@"DECLARE @patientId UNIQUEIDENTIFIER;");
      writer.WriteLine(@"DECLARE @woundId UNIQUEIDENTIFIER;");
      writer.WriteLine(@"DECLARE @woundStateId UNIQUEIDENTIFIER;");
      writer.WriteLine(@"DECLARE @assessmentId UNIQUEIDENTIFIER;");
      writer.WriteLine(@"DECLARE @assessmentWoundStateId UNIQUEIDENTIFIER;");
      writer.WriteLine(@"DECLARE @attributeId UNIQUEIDENTIFIER;");
      writer.WriteLine(@"DECLARE @etiologyAttributeId UNIQUEIDENTIFIER;");
      writer.WriteLine(@"DECLARE @imageId UNIQUEIDENTIFIER;");

      writer.WriteLine();
    }

    private static void WritePatient(this StreamWriter writer, Patient patient, int staffUserNUmber)
    {
      writer.WritePatientInserts(patient);

      foreach (var wound in patient.Wounds)
      {
        writer.WriteWound(wound);
        foreach (var assessment in wound.WoundAssessments)
        {
          writer.WriteWoundAssessment(wound.WoundClassificationReadable, assessment, staffUserNUmber);
        }

        foreach (var assessment in wound.VisitAssessments)
        {
          writer.WriteVisitAssessment(assessment);
        }
      }
      writer.WriteLine();
    }

    private static void WritePatientInserts(this StreamWriter writer, Patient patient)
    {
      writer.WriteLine(@"SET @patientId = NEWID();");
      writer.WriteLine(
        $@"INSERT INTO dbo.Patient ( id, accessCode, dateOfBirth, domainId, firstName, lastName, middleName, unitFk ) 
VALUES ( @patientId, 'abcdef', '{patient.DateOfBirth:yyyy-MM-dd}', '{patient.ID}', '{patient.FirstName}', '{patient.LastName}', {(string.IsNullOrEmpty(patient.MiddleName) ? "NULL" : $"'{patient.MiddleName}'")}, @unitId );");
      writer.WriteLine(
        @$"INSERT INTO dbo.PatientNote ( id, patientFk, assessmentTypeVersionFk ) VALUES ( NEWID(), @patientId, @patientDetailsVersionId )");
    }

    private static void WriteWound(this StreamWriter writer, Wound wound)
    {
      writer.WriteLine(@"SET @woundId = NEWID();");
      writer.WriteLine(@"SET @woundStateId = NEWID();");

      var baselineDate = wound.WoundAssessments.FirstOrDefault(a => a.IsBaseline).DateTime;
      writer.WriteLine(
        $@"INSERT INTO dbo.Wound ( id, patientFk, anatomyFk, auxText, woundIndex, baselineDate, baselineTimeZoneId )
VALUES ( @woundId, @patientId, ( SELECT TOP 1 Id FROM @anatomies WHERE [Name] = '{wound.AnatomicalSite.ToLowerInvariant()}' ), '', {wound.Index}, {GetDateStatement(baselineDate)}, 'Pacific/Auckland');
INSERT INTO dbo.WoundState ( id, attributeLookupFk, woundFk, timeZoneId, [date], assessmentTypeVersionFk )
VALUES ( @woundStateId, ( SELECT TOP 1 lookupId FROM @woundStateLookup WHERE [state] = 'Open' ), @woundId, 'Pacific/Auckland', {GetDateStatement(baselineDate)}, @woundStateAssessmentTypeVersionId );
--INSERT INTO dbo.WoundStateAttribute ( id, attributeTypeFk, woundStateFk, [value] )
--VALUES ( NEWID(), @woundTypeAttributeTypeId, @woundStateId, '{wound.WoundClassificationReadable}' );");
    }

    private static void WriteWoundAssessment(
      this StreamWriter writer,
      string woundClassification,
      WoundAssessment assessment,
      int staffUserNumber)
    {
      writer.WriteLine(@"SET @assessmentId = NEWID();");
      writer.WriteLine(@"SET @assessmentWoundStateId = NEWID();");
      writer.WriteLine(@"SET @attributeId = NEWID();");
      writer.WriteLine(@"SET @etiologyAttributeId = NEWID();");
      writer.WriteLine(@"SET @imageId = NEWID();");
      
      var staffUser =  staffUserNumber == 1 ? "@staffUser1" : 2 == staffUserNumber ? "@staffUser2" : "@staffUser3";

            writer.WriteLine($@"INSERT INTO dbo.Series ( id, patientFk, woundFk, [date], timeZoneId, assessmentTypeVersionFk, createdInUnitFk )
VALUES ( @assessmentId, @patientId, @woundId, {GetDateStatement(assessment.DateTime)}, 'Pacific/Auckland', @woundAssessmentTypeVersionId, @unitId);

SET @auditLogActionId = NEWID();
INSERT INTO dbo.AuditLogAction (id, actionDate, objectId, staffUserFk ) VALUES
(@auditLogActionId, {GetDateStatement(assessment.DateTime)},  @assessmentId, {staffUser});
INSERT INTO dbo.AuditLogActionType(id, action, auditLogActionFk, child ) VALUES
(NEWID(), 1100, @auditLogActionId, 0)


INSERT INTO dbo.WoundState ( id, attributeLookupFk, woundFk, seriesFk, timeZoneId, [date], assessmentTypeVersionFk )
VALUES ( @assessmentWoundStateId, ( SELECT TOP 1 lookupId FROM @woundStateLookup WHERE [state] = '{assessment.WoundState}' ), @woundId, @assessmentId, 'Pacific/Auckland', {GetDateStatement(assessment.DateTime)}, @woundStateAssessmentTypeVersionId )
--INSERT INTO dbo.WoundStateAttribute ( id, attributeTypeFk, woundStateFk, [value] )
--VALUES ( NEWID(), @woundTypeAttributeTypeId, @assessmentWoundStateId, '{woundClassification}' );
INSERT INTO dbo.WoundAttribute ( id, attributeTypeFk, [value], seriesFk )
VALUES ( @attributeId, @woundImagesAttributeTypeId, '', @assessmentId ),
       ( @etiologyAttributeId, @etiologyAttributeTypeId, '{woundClassification}', @assessmentId )--,
--       ( NEWID(), @treatmentTypeAttributeTypeId, '{assessment.Treatment}', @assessmentId );
INSERT INTO dbo.ImageCapture ( id, [date], capturedByStaffUserFk, patientFk, imageFormatFk, isTraceable, woundAttributeFk, showInBucket, width, height )
VALUES ( @imageId, {GetDateStatement(assessment.DateTime)}, {staffUser}, @patientId, '2F63CD64-0BC4-47F2-80F7-F2450ADC0ECB', 1, @attributeId, 1, 2448, 3264 );
INSERT INTO dbo.Outline ( points, pointCount, area, perimeter, island, imageCaptureFk )
VALUES ( 0x0000803F0000803F0000803F0000C8420000C8420000C8420000C8420000803F, 4, {assessment.WoundArea}, {assessment.WoundPerimeter}, 0, @imageId )");
    }

        private static void WriteVisitAssessment(
      this StreamWriter writer,
      VisitAssessment assessment)
        {
            writer.WriteLine(@"SET @assessmentId = NEWID();");

            writer.WriteLine($@"INSERT INTO dbo.Series ( id, patientFk, [date], timeZoneId, assessmentTypeVersionFk, createdInUnitFk )
VALUES ( @assessmentId, @patientId, {GetDateStatement(assessment.DateTime)}, 'Pacific/Auckland', @visitAssessmentTypeVersionId, @unitId);");
        }

    private static string GetDateStatement(this DateTime dateTime)
    {
      return $"DATEADD(DAY, {Convert.ToInt64(dateTime.Date.Subtract(UtcNowInstance).TotalDays)}, @now)";
    }
  }
}
