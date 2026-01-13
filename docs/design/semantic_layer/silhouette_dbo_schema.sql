-- DROP SCHEMA dbo;

CREATE SCHEMA dbo;
-- Silhouette.dbo.AccessGroup definition

-- Drop table

-- DROP TABLE Silhouette.dbo.AccessGroup;

CREATE TABLE Silhouette.dbo.AccessGroup (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	name nvarchar(128) COLLATE Latin1_General_CI_AS NOT NULL,
	description nvarchar(128) COLLATE Latin1_General_CI_AS DEFAULT '' NOT NULL,
	canAccessAllUnits bit DEFAULT 0 NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK__AccessGroup PRIMARY KEY (id)
);
 CREATE UNIQUE NONCLUSTERED INDEX IX__AccessGroup__name ON Silhouette.dbo.AccessGroup (  name ASC  )  
	 WHERE  ([name]<>'' AND [isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.Anatomy definition

-- Drop table

-- DROP TABLE Silhouette.dbo.Anatomy;

CREATE TABLE Silhouette.dbo.Anatomy (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	parentId uniqueidentifier NULL,
	[text] nvarchar(255) COLLATE Latin1_General_CI_AS NOT NULL,
	abbreviation nvarchar(255) COLLATE Latin1_General_CI_AS NOT NULL,
	[level] int NOT NULL,
	sortOrder int NOT NULL,
	allowText bit NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	xCoordinate int NULL,
	yCoordinate int NULL,
	code nvarchar(128) COLLATE Latin1_General_CI_AS NULL,
	displayText nvarchar(128) COLLATE Latin1_General_CI_AS DEFAULT '' NOT NULL,
	CONSTRAINT PK_Anatomy PRIMARY KEY (id)
);
 CREATE NONCLUSTERED INDEX IX_Anatomy_parentId ON Silhouette.dbo.Anatomy (  parentId ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.AssessmentType definition

-- Drop table

-- DROP TABLE Silhouette.dbo.AssessmentType;

CREATE TABLE Silhouette.dbo.AssessmentType (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	[type] int NOT NULL,
	orderIndex int DEFAULT 0 NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	applicationRights smallint DEFAULT 5 NOT NULL,
	abbreviation nvarchar(10) COLLATE Latin1_General_CI_AS NULL,
	canIncludeInProgressNote bit DEFAULT 0 NOT NULL,
	isAllNotesIncluded bit DEFAULT 1 NOT NULL,
	CONSTRAINT PK_AssessmentType PRIMARY KEY (id)
);


-- Silhouette.dbo.AttributeFile definition

-- Drop table

-- DROP TABLE Silhouette.dbo.AttributeFile;

CREATE TABLE Silhouette.dbo.AttributeFile (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	fileName nvarchar(255) COLLATE Latin1_General_CI_AS NOT NULL,
	fileType int NOT NULL,
	mimeType nvarchar(255) COLLATE Latin1_General_CI_AS NOT NULL,
	uploadedDate datetime NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	CONSTRAINT PK_AttributeFile PRIMARY KEY (id)
);


-- Silhouette.dbo.AuditLogControl definition

-- Drop table

-- DROP TABLE Silhouette.dbo.AuditLogControl;

CREATE TABLE Silhouette.dbo.AuditLogControl (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	objectType nvarchar(100) COLLATE Latin1_General_CI_AS NOT NULL,
	objectProperty nvarchar(100) COLLATE Latin1_General_CI_AS NOT NULL,
	displayType nvarchar(100) COLLATE Latin1_General_CI_AS NOT NULL,
	displayProperty nvarchar(100) COLLATE Latin1_General_CI_AS NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	CONSTRAINT PK_AuditControl PRIMARY KEY (id)
);
 CREATE UNIQUE NONCLUSTERED INDEX IX_AuditLogControl_ObjectType_Id ON Silhouette.dbo.AuditLogControl (  objectType ASC  , id ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.AuthenticationCertificate definition

-- Drop table

-- DROP TABLE Silhouette.dbo.AuthenticationCertificate;

CREATE TABLE Silhouette.dbo.AuthenticationCertificate (
	id uniqueidentifier NOT NULL,
	clientCode nvarchar(MAX) COLLATE Latin1_General_CI_AS NOT NULL,
	azureClientId uniqueidentifier NOT NULL,
	thumbprint nvarchar(MAX) COLLATE Latin1_General_CI_AS NOT NULL,
	subject nvarchar(MAX) COLLATE Latin1_General_CI_AS NOT NULL,
	issuedAt datetime NOT NULL,
	expiry datetime NOT NULL,
	state smallint NOT NULL,
	[data] varbinary(MAX) NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK__AuthenticationCertificate PRIMARY KEY (id)
);


-- Silhouette.dbo.BackgroundTableSync definition

-- Drop table

-- DROP TABLE Silhouette.dbo.BackgroundTableSync;

CREATE TABLE Silhouette.dbo.BackgroundTableSync (
	id uniqueidentifier NOT NULL,
	name nvarchar(256) COLLATE Latin1_General_CI_AS NOT NULL,
	tempName nvarchar(256) COLLATE Latin1_General_CI_AS NOT NULL,
	[where] nvarchar(256) COLLATE Latin1_General_CI_AS NOT NULL,
	state int NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	[order] int DEFAULT 0 NOT NULL,
	CONSTRAINT PK_BackgroundTableSync PRIMARY KEY (id)
);


-- Silhouette.dbo.Configuration definition

-- Drop table

-- DROP TABLE Silhouette.dbo.Configuration;

CREATE TABLE Silhouette.dbo.Configuration (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	name nvarchar(128) COLLATE Latin1_General_CI_AS NOT NULL,
	value nvarchar(2048) COLLATE Latin1_General_CI_AS NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	syncAllowed bit DEFAULT 0 NOT NULL,
	CONSTRAINT IX_Configuration_name UNIQUE (name),
	CONSTRAINT PK_Configuration PRIMARY KEY (id)
);


-- Silhouette.dbo.CustomFile definition

-- Drop table

-- DROP TABLE Silhouette.dbo.CustomFile;

CREATE TABLE Silhouette.dbo.CustomFile (
	id uniqueidentifier NOT NULL,
	[key] nvarchar(64) COLLATE Latin1_General_CI_AS NOT NULL,
	etag nvarchar(64) COLLATE Latin1_General_CI_AS NOT NULL,
	filename nvarchar(128) COLLATE Latin1_General_CI_AS NOT NULL,
	mimeType nvarchar(32) COLLATE Latin1_General_CI_AS NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK_CustomFile PRIMARY KEY (id)
);
 CREATE UNIQUE NONCLUSTERED INDEX IX_CustomFile_key ON Silhouette.dbo.CustomFile (  key ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.Dashboard definition

-- Drop table

-- DROP TABLE Silhouette.dbo.Dashboard;

CREATE TABLE Silhouette.dbo.Dashboard (
	id uniqueidentifier NOT NULL,
	name nvarchar(64) COLLATE Latin1_General_CI_AS NOT NULL,
	template nvarchar(MAX) COLLATE Latin1_General_CI_AS NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK__Dashboard PRIMARY KEY (id)
);
 CREATE UNIQUE NONCLUSTERED INDEX IX_Dashboard_Name ON Silhouette.dbo.Dashboard (  name ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.Device definition

-- Drop table

-- DROP TABLE Silhouette.dbo.Device;

CREATE TABLE Silhouette.dbo.Device (
	id uniqueidentifier NOT NULL,
	deviceId nvarchar(150) COLLATE Latin1_General_CI_AS NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK_Device PRIMARY KEY (id)
);


-- Silhouette.dbo.Email definition

-- Drop table

-- DROP TABLE Silhouette.dbo.Email;

CREATE TABLE Silhouette.dbo.Email (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	subject nvarchar(128) COLLATE Latin1_General_CI_AS NOT NULL,
	body nvarchar(MAX) COLLATE Latin1_General_CI_AS NOT NULL,
	[to] nvarchar(128) COLLATE Latin1_General_CI_AS NOT NULL,
	created datetime NOT NULL,
	systemEventId uniqueidentifier NULL,
	status int NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	retryFrequency int NULL,
	nextRetryDate datetime NULL,
	lastRetryDate datetime NULL,
	[type] int DEFAULT 0 NOT NULL,
	CONSTRAINT PK_Emails PRIMARY KEY (id)
);


-- Silhouette.dbo.EmailStatistics definition

-- Drop table

-- DROP TABLE Silhouette.dbo.EmailStatistics;

CREATE TABLE Silhouette.dbo.EmailStatistics (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	emailsSent int NOT NULL,
	systemEvents int NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	CONSTRAINT PK_EmailStatistics PRIMARY KEY (id)
);


-- Silhouette.dbo.EmailTemplateFile definition

-- Drop table

-- DROP TABLE Silhouette.dbo.EmailTemplateFile;

CREATE TABLE Silhouette.dbo.EmailTemplateFile (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	fileName nvarchar(256) COLLATE Latin1_General_CI_AS NOT NULL,
	createdDate datetime NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	displayFilename nvarchar(128) COLLATE Latin1_General_CI_AS NOT NULL,
	subject nvarchar(128) COLLATE Latin1_General_CI_AS NULL,
	CONSTRAINT PK_EmailTemplateFile PRIMARY KEY (id)
);


-- Silhouette.dbo.EnvironmentVariable definition

-- Drop table

-- DROP TABLE Silhouette.dbo.EnvironmentVariable;

CREATE TABLE Silhouette.dbo.EnvironmentVariable (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	name nvarchar(64) COLLATE Latin1_General_CI_AS NOT NULL,
	value nvarchar(2048) COLLATE Latin1_General_CI_AS NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	CONSTRAINT AK_EnvironmentVariable_name UNIQUE (name),
	CONSTRAINT PK_EnvironmentVariable PRIMARY KEY (id)
);


-- Silhouette.dbo.ExternalAuthenticationProvider definition

-- Drop table

-- DROP TABLE Silhouette.dbo.ExternalAuthenticationProvider;

CREATE TABLE Silhouette.dbo.ExternalAuthenticationProvider (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	scheme nvarchar(64) COLLATE Latin1_General_CI_AS NOT NULL,
	displayName nvarchar(64) COLLATE Latin1_General_CI_AS NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK_ExternalAuthenticationProvider PRIMARY KEY (id)
);


-- Silhouette.dbo.FiducialType definition

-- Drop table

-- DROP TABLE Silhouette.dbo.FiducialType;

CREATE TABLE Silhouette.dbo.FiducialType (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	brand nvarchar(50) COLLATE Latin1_General_CI_AS NOT NULL,
	supplierDescription nvarchar(500) COLLATE Latin1_General_CI_AS NULL,
	diameter decimal(5,2) NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	shortName nvarchar(20) COLLATE Latin1_General_CI_AS NOT NULL,
	purchasingDetails nvarchar(500) COLLATE Latin1_General_CI_AS NULL,
	enabled bit NOT NULL,
	isSystemDefault bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK_FiducialType PRIMARY KEY (id)
);


-- Silhouette.dbo.ImageFormat definition

-- Drop table

-- DROP TABLE Silhouette.dbo.ImageFormat;

CREATE TABLE Silhouette.dbo.ImageFormat (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	format int NOT NULL,
	allowTracing bit NOT NULL,
	hasLaserDetection bit NOT NULL,
	showInBucket bit NOT NULL,
	description nvarchar(255) COLLATE Latin1_General_CI_AS NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	CONSTRAINT PK_ImageFormat PRIMARY KEY (id)
);


-- Silhouette.dbo.NetworkConfiguration definition

-- Drop table

-- DROP TABLE Silhouette.dbo.NetworkConfiguration;

CREATE TABLE Silhouette.dbo.NetworkConfiguration (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	networkDescription nvarchar(255) COLLATE Latin1_General_CI_AS NOT NULL,
	networkType int NOT NULL,
	networkSSID nvarchar(255) COLLATE Latin1_General_CI_AS NOT NULL,
	networkKey nvarchar(255) COLLATE Latin1_General_CI_AS NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK_NetworkConfiguration PRIMARY KEY (id)
);


-- Silhouette.dbo.RecipientGroup definition

-- Drop table

-- DROP TABLE Silhouette.dbo.RecipientGroup;

CREATE TABLE Silhouette.dbo.RecipientGroup (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	name nvarchar(128) COLLATE Latin1_General_CI_AS NOT NULL,
	description nvarchar(255) COLLATE Latin1_General_CI_AS NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	CONSTRAINT PK_RecipientGroups PRIMARY KEY (id)
);


-- Silhouette.dbo.ReportTemplate definition

-- Drop table

-- DROP TABLE Silhouette.dbo.ReportTemplate;

CREATE TABLE Silhouette.dbo.ReportTemplate (
	id uniqueidentifier NOT NULL,
	name nvarchar(255) COLLATE Latin1_General_CI_AS NOT NULL,
	creationDate datetime NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK__ReportTemplate PRIMARY KEY (id)
);
 CREATE UNIQUE NONCLUSTERED INDEX IX_ReportTemplate_Name ON Silhouette.dbo.ReportTemplate (  name ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.[Role] definition

-- Drop table

-- DROP TABLE Silhouette.dbo.[Role];

CREATE TABLE Silhouette.dbo.[Role] (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	name nvarchar(128) COLLATE Latin1_General_CI_AS NOT NULL,
	description nvarchar(128) COLLATE Latin1_General_CI_AS DEFAULT '' NOT NULL,
	productRights smallint DEFAULT 0 NOT NULL,
	patientRights int DEFAULT 0 NOT NULL,
	userRights smallint DEFAULT 0 NOT NULL,
	organizationRights smallint DEFAULT 0 NOT NULL,
	unitRights smallint DEFAULT 0 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	forcePasswordReset bit DEFAULT 0 NOT NULL,
	woundRights smallint DEFAULT 0 NOT NULL,
	assessmentRights smallint DEFAULT 0 NOT NULL,
	orderRights smallint DEFAULT 0 NOT NULL,
	[type] smallint DEFAULT 0 NOT NULL,
	imagingRights smallint DEFAULT 0 NOT NULL,
	CONSTRAINT PK_StaffGroup PRIMARY KEY (id)
);


-- Silhouette.dbo.SeriesReport definition

-- Drop table

-- DROP TABLE Silhouette.dbo.SeriesReport;

CREATE TABLE Silhouette.dbo.SeriesReport (
	id int NULL,
	isDeleted int NULL
);


-- Silhouette.dbo.SoftwareVersion definition

-- Drop table

-- DROP TABLE Silhouette.dbo.SoftwareVersion;

CREATE TABLE Silhouette.dbo.SoftwareVersion (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	version nvarchar(255) COLLATE Latin1_General_CI_AS NOT NULL,
	cabName nvarchar(255) COLLATE Latin1_General_CI_AS NOT NULL,
	dateInstalled datetime NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	deviceType int NOT NULL,
	fileHash nvarchar(64) COLLATE Latin1_General_CI_AS NULL,
	CONSTRAINT PK_SoftwareVersion PRIMARY KEY (id)
);


-- Silhouette.dbo.SurfaceModelVersion definition

-- Drop table

-- DROP TABLE Silhouette.dbo.SurfaceModelVersion;

CREATE TABLE Silhouette.dbo.SurfaceModelVersion (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	description nvarchar(MAX) COLLATE Latin1_General_CI_AS NOT NULL,
	versionNumber int NOT NULL,
	processingVersionNumber int NOT NULL,
	imageCount int NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK_SurfaceModelVersion PRIMARY KEY (id)
);


-- Silhouette.dbo.SyncConflictLog definition

-- Drop table

-- DROP TABLE Silhouette.dbo.SyncConflictLog;

CREATE TABLE Silhouette.dbo.SyncConflictLog (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	objectId uniqueidentifier NOT NULL,
	objectType int NOT NULL,
	conflictType int NOT NULL,
	description nvarchar(256) COLLATE Latin1_General_CI_AS NULL,
	deviceId nvarchar(150) COLLATE Latin1_General_CI_AS NOT NULL,
	connectLastCentralChangeDate datetime NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	CONSTRAINT PK_SyncConflictLog PRIMARY KEY (id)
);


-- Silhouette.dbo.SystemEvent definition

-- Drop table

-- DROP TABLE Silhouette.dbo.SystemEvent;

CREATE TABLE Silhouette.dbo.SystemEvent (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	eventType int NOT NULL,
	[data] nvarchar(MAX) COLLATE Latin1_General_CI_AS NULL,
	createdDate datetime NOT NULL,
	processedDate datetime NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	objectId uniqueidentifier NOT NULL,
	CONSTRAINT PK_SystemEvent PRIMARY KEY (id)
);
 CREATE NONCLUSTERED INDEX IX_SystemEvent_CreatedDate ON Silhouette.dbo.SystemEvent (  createdDate ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.Unit definition

-- Drop table

-- DROP TABLE Silhouette.dbo.Unit;

CREATE TABLE Silhouette.dbo.Unit (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	name nvarchar(128) COLLATE Latin1_General_CI_AS NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	address nvarchar(128) COLLATE Latin1_General_CI_AS NULL,
	showOrders bit DEFAULT 1 NOT NULL,
	CONSTRAINT PK_Unit PRIMARY KEY (id)
);


-- Silhouette.dbo.Version definition

-- Drop table

-- DROP TABLE Silhouette.dbo.Version;

CREATE TABLE Silhouette.dbo.Version (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	SchemaVersion int NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	MinorVersion int DEFAULT 0 NOT NULL,
	CONSTRAINT PK_Version PRIMARY KEY (id)
);


-- Silhouette.dbo.WoundGraph definition

-- Drop table

-- DROP TABLE Silhouette.dbo.WoundGraph;

CREATE TABLE Silhouette.dbo.WoundGraph (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	name nvarchar(255) COLLATE Latin1_General_CI_AS NOT NULL,
	orderIndex int NOT NULL,
	isAreaVisible bit NOT NULL,
	isMeanDepthVisible bit NOT NULL,
	isMaxDepthVisible bit NOT NULL,
	isVolumeVisible bit NOT NULL,
	isPerimeterVisible bit NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isAreaReductionVisible bit NOT NULL,
	attributeTypeKey uniqueidentifier NOT NULL,
	CONSTRAINT PK_WoundGraph PRIMARY KEY (id)
);


-- Silhouette.dbo.AccessGroupUnit definition

-- Drop table

-- DROP TABLE Silhouette.dbo.AccessGroupUnit;

CREATE TABLE Silhouette.dbo.AccessGroupUnit (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	unitFk uniqueidentifier NOT NULL,
	accessGroupFk uniqueidentifier NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK__AccessGroupUnit PRIMARY KEY (id),
	CONSTRAINT FK__AccessGroupUnit__AccessGroup FOREIGN KEY (accessGroupFk) REFERENCES Silhouette.dbo.AccessGroup(id),
	CONSTRAINT FK__AccessGroupUnit__Unit FOREIGN KEY (unitFk) REFERENCES Silhouette.dbo.Unit(id)
);


-- Silhouette.dbo.AssessmentAction definition

-- Drop table

-- DROP TABLE Silhouette.dbo.AssessmentAction;

CREATE TABLE Silhouette.dbo.AssessmentAction (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	actionType int NOT NULL,
	triggerType int NOT NULL,
	name nvarchar(128) COLLATE Latin1_General_CI_AS NULL,
	[condition] nvarchar(255) COLLATE Latin1_General_CI_AS NOT NULL,
	allUnits bit NULL,
	description nvarchar(128) COLLATE Latin1_General_CI_AS NULL,
	assessmentTypeFk uniqueidentifier NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	minDefinitionVersion int NULL,
	maxDefinitionVersion int NULL,
	status smallint NOT NULL,
	CONSTRAINT PK_AssessmentAction PRIMARY KEY (id),
	CONSTRAINT FK_AssessmentAction_AssessmentType FOREIGN KEY (assessmentTypeFk) REFERENCES Silhouette.dbo.AssessmentType(id)
);


-- Silhouette.dbo.AssessmentActionOutputEmail definition

-- Drop table

-- DROP TABLE Silhouette.dbo.AssessmentActionOutputEmail;

CREATE TABLE Silhouette.dbo.AssessmentActionOutputEmail (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	assessmentActionFk uniqueidentifier NOT NULL,
	attachReport bit NULL,
	emailTemplateFileFk uniqueidentifier NULL,
	CONSTRAINT PK_AssessmentActionOutputEmail PRIMARY KEY (id),
	CONSTRAINT FK_AssessmentActionOutputEmail_AssessmentAction FOREIGN KEY (assessmentActionFk) REFERENCES Silhouette.dbo.AssessmentAction(id),
	CONSTRAINT FK_AssessmentActionOutputEmail_EmailTemplateFile FOREIGN KEY (emailTemplateFileFk) REFERENCES Silhouette.dbo.EmailTemplateFile(id)
);


-- Silhouette.dbo.AssessmentActionOutputEmailRecipientGroup definition

-- Drop table

-- DROP TABLE Silhouette.dbo.AssessmentActionOutputEmailRecipientGroup;

CREATE TABLE Silhouette.dbo.AssessmentActionOutputEmailRecipientGroup (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	recipientGroupFk uniqueidentifier NOT NULL,
	assessmentActionOutputEmailFk uniqueidentifier NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	CONSTRAINT PK_AssessmentActionOutputEmailRecipientGroup PRIMARY KEY (id),
	CONSTRAINT FK_AssessmentActionOutputEmailRecipientGroup_AssessmentActionOutputEmail FOREIGN KEY (assessmentActionOutputEmailFk) REFERENCES Silhouette.dbo.AssessmentActionOutputEmail(id),
	CONSTRAINT FK_AssessmentActionOutputEmailRecipientGroup_RecipientGroup FOREIGN KEY (recipientGroupFk) REFERENCES Silhouette.dbo.RecipientGroup(id)
);


-- Silhouette.dbo.AssessmentActionUnit definition

-- Drop table

-- DROP TABLE Silhouette.dbo.AssessmentActionUnit;

CREATE TABLE Silhouette.dbo.AssessmentActionUnit (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	unitFk uniqueidentifier NOT NULL,
	assessmentActionFk uniqueidentifier NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	CONSTRAINT PK_AssessmentActionUnit PRIMARY KEY (id),
	CONSTRAINT FK_AssessmentActionUnit_AssessmentAction FOREIGN KEY (assessmentActionFk) REFERENCES Silhouette.dbo.AssessmentAction(id),
	CONSTRAINT FK_AssessmentActionUnit_Unit FOREIGN KEY (unitFk) REFERENCES Silhouette.dbo.Unit(id)
);


-- Silhouette.dbo.AssessmentTypeVersion definition

-- Drop table

-- DROP TABLE Silhouette.dbo.AssessmentTypeVersion;

CREATE TABLE Silhouette.dbo.AssessmentTypeVersion (
	id uniqueidentifier NOT NULL,
	definitionVersion int NOT NULL,
	versionType smallint NOT NULL,
	assessmentTypeFk uniqueidentifier NOT NULL,
	reportTemplateFk uniqueidentifier NULL,
	reportNameTemplate nvarchar(2048) COLLATE Latin1_General_CI_AS NULL,
	name nvarchar(255) COLLATE Latin1_General_CI_AS NOT NULL,
	description nvarchar(255) COLLATE Latin1_General_CI_AS NOT NULL,
	publishDate datetime NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	retiredDate datetime NULL,
	CONSTRAINT PK__AssessmentTypeVersion PRIMARY KEY (id),
	CONSTRAINT FK__AssessmentTypeVersion__AssessmentType FOREIGN KEY (assessmentTypeFk) REFERENCES Silhouette.dbo.AssessmentType(id),
	CONSTRAINT FK__AssessmentTypeVersion__ReportTemplate FOREIGN KEY (reportTemplateFk) REFERENCES Silhouette.dbo.ReportTemplate(id)
);
 CREATE UNIQUE NONCLUSTERED INDEX IX_AssessmentTypeVersion_AssessmentTypeFk_VersionType ON Silhouette.dbo.AssessmentTypeVersion (  assessmentTypeFk ASC  , versionType ASC  )  
	 WHERE  ([isDeleted]=(0) AND [versionType]>(1))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE UNIQUE NONCLUSTERED INDEX IX_AssessmentTypeVersion_AssessmentType_DefinitionVersion ON Silhouette.dbo.AssessmentTypeVersion (  assessmentTypeFk ASC  , definitionVersion ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.AttributeSet definition

-- Drop table

-- DROP TABLE Silhouette.dbo.AttributeSet;

CREATE TABLE Silhouette.dbo.AttributeSet (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	name nvarchar(128) COLLATE Latin1_General_CI_AS NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	description nvarchar(255) COLLATE Latin1_General_CI_AS NULL,
	attributeSetKey uniqueidentifier NOT NULL,
	versionType smallint NOT NULL,
	[type] smallint NOT NULL,
	patientNoteAssessmentTypeFk uniqueidentifier NULL,
	publishDate datetime NULL,
	viewerInfo nvarchar(500) COLLATE Latin1_General_CI_AS NULL,
	editorInfo nvarchar(500) COLLATE Latin1_General_CI_AS NULL,
	CONSTRAINT PK_AttributeSet PRIMARY KEY (id),
	CONSTRAINT FK_AttributeSet_patientNoteAssessmentTypeFk FOREIGN KEY (patientNoteAssessmentTypeFk) REFERENCES Silhouette.dbo.AssessmentType(id)
);
 CREATE NONCLUSTERED INDEX IX_AttributeSet_attributeSetKey ON Silhouette.dbo.AttributeSet (  attributeSetKey ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_AttributeSet_patientNoteAssessmentTypeFk ON Silhouette.dbo.AttributeSet (  patientNoteAssessmentTypeFk ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.AttributeSetAssessmentTypeVersion definition

-- Drop table

-- DROP TABLE Silhouette.dbo.AttributeSetAssessmentTypeVersion;

CREATE TABLE Silhouette.dbo.AttributeSetAssessmentTypeVersion (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	attributeSetFk uniqueidentifier NOT NULL,
	assessmentTypeVersionFk uniqueidentifier NOT NULL,
	orderIndex int NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK_AttributeSetAssessmentTypeVersion PRIMARY KEY (id),
	CONSTRAINT FK_AttributeSetAssessmentTypeVersion_AssessmentTypeVersion FOREIGN KEY (assessmentTypeVersionFk) REFERENCES Silhouette.dbo.AssessmentTypeVersion(id),
	CONSTRAINT FK_AttributeSetAssessmentTypeVersion_AttributeSet FOREIGN KEY (attributeSetFk) REFERENCES Silhouette.dbo.AttributeSet(id)
);
 CREATE NONCLUSTERED INDEX IX_AttributeSetAssessmentTypeVersion_AssessmentTypeVersionFk_AttributeSetFk ON Silhouette.dbo.AttributeSetAssessmentTypeVersion (  assessmentTypeVersionFk ASC  , attributeSetFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_AttributeSetAssessmentTypeVersion_AttributeSetFk ON Silhouette.dbo.AttributeSetAssessmentTypeVersion (  attributeSetFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.EmailAttachment definition

-- Drop table

-- DROP TABLE Silhouette.dbo.EmailAttachment;

CREATE TABLE Silhouette.dbo.EmailAttachment (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	attachment nvarchar(256) COLLATE Latin1_General_CI_AS NOT NULL,
	created datetime NOT NULL,
	emailFk uniqueidentifier NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	CONSTRAINT PK_EmailAttachment PRIMARY KEY (id),
	CONSTRAINT FK_EmailAttachment_Email FOREIGN KEY (emailFk) REFERENCES Silhouette.dbo.Email(id) ON DELETE CASCADE
);
 CREATE NONCLUSTERED INDEX IX_EmailAttachment_Email ON Silhouette.dbo.EmailAttachment (  emailFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.ExternalAuthenticationProviderAccessGroupKey definition

-- Drop table

-- DROP TABLE Silhouette.dbo.ExternalAuthenticationProviderAccessGroupKey;

CREATE TABLE Silhouette.dbo.ExternalAuthenticationProviderAccessGroupKey (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	externalAuthenticationProviderFk uniqueidentifier NOT NULL,
	accessGroupFk uniqueidentifier NOT NULL,
	[key] nvarchar(512) COLLATE Latin1_General_CI_AS NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK_ExternalAuthenticationProviderAccessGroupKey PRIMARY KEY (id),
	CONSTRAINT FK_ExternalAuthenticationProviderAccessGroupKey_ExternalAuthenticationProvider FOREIGN KEY (externalAuthenticationProviderFk) REFERENCES Silhouette.dbo.ExternalAuthenticationProvider(id),
	CONSTRAINT FK_ExternalAuthenticationProviderAccessGroupKey_StaffGroup FOREIGN KEY (accessGroupFk) REFERENCES Silhouette.dbo.AccessGroup(id)
);
 CREATE NONCLUSTERED INDEX IX_ExternalAuthenticationProviderAccessGroupKey_AccessGroup ON Silhouette.dbo.ExternalAuthenticationProviderAccessGroupKey (  accessGroupFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.ExternalAuthenticationProviderRoleKey definition

-- Drop table

-- DROP TABLE Silhouette.dbo.ExternalAuthenticationProviderRoleKey;

CREATE TABLE Silhouette.dbo.ExternalAuthenticationProviderRoleKey (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	externalAuthenticationProviderFk uniqueidentifier NOT NULL,
	roleFk uniqueidentifier NOT NULL,
	[key] nvarchar(512) COLLATE Latin1_General_CI_AS NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK_ExternalAuthenticationProviderStaffGroupKey PRIMARY KEY (id),
	CONSTRAINT FK_ExternalAuthenticationProviderRoleKey_ExternalAuthenticationProvider FOREIGN KEY (externalAuthenticationProviderFk) REFERENCES Silhouette.dbo.ExternalAuthenticationProvider(id),
	CONSTRAINT FK_ExternalAuthenticationProviderRoleKey_StaffGroup FOREIGN KEY (roleFk) REFERENCES Silhouette.dbo.[Role](id)
);
 CREATE NONCLUSTERED INDEX IX_ExternalAuthenticationProviderStaffGroupKey_StaffGroup ON Silhouette.dbo.ExternalAuthenticationProviderRoleKey (  roleFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.IntegrationEvent definition

-- Drop table

-- DROP TABLE Silhouette.dbo.IntegrationEvent;

CREATE TABLE Silhouette.dbo.IntegrationEvent (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	eventData nvarchar(MAX) COLLATE Latin1_General_CI_AS NOT NULL,
	eventType int NOT NULL,
	created datetime NOT NULL,
	systemEventFk uniqueidentifier NOT NULL,
	status int NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	retryFrequency int NULL,
	nextRetryDate datetime NULL,
	lastRetryDate datetime NULL,
	CONSTRAINT PK_IntegrationEvent PRIMARY KEY (id),
	CONSTRAINT FK_IntegrationEvent_SystemEvent FOREIGN KEY (systemEventFk) REFERENCES Silhouette.dbo.SystemEvent(id)
);


-- Silhouette.dbo.Patient definition

-- Drop table

-- DROP TABLE Silhouette.dbo.Patient;

CREATE TABLE Silhouette.dbo.Patient (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	firstName nvarchar(128) COLLATE Latin1_General_CI_AS NULL,
	middleName nvarchar(128) COLLATE Latin1_General_CI_AS NULL,
	lastName nvarchar(128) COLLATE Latin1_General_CI_AS NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	dateOfBirth datetime NULL,
	addressStreet nvarchar(255) COLLATE Latin1_General_CI_AS NULL,
	addressSuburb nvarchar(255) COLLATE Latin1_General_CI_AS NULL,
	addressCity nvarchar(255) COLLATE Latin1_General_CI_AS NULL,
	addressState nvarchar(255) COLLATE Latin1_General_CI_AS NULL,
	addressPostcode nvarchar(50) COLLATE Latin1_General_CI_AS NULL,
	addressCountry nvarchar(255) COLLATE Latin1_General_CI_AS NULL,
	workPhone nvarchar(50) COLLATE Latin1_General_CI_AS NULL,
	homePhone nvarchar(50) COLLATE Latin1_General_CI_AS NULL,
	mobilePhone nvarchar(50) COLLATE Latin1_General_CI_AS NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	unitFk uniqueidentifier NOT NULL,
	domainId nvarchar(128) COLLATE Latin1_General_CI_AS NULL,
	lastCentralChangeDate datetime DEFAULT getutcdate() NOT NULL,
	accessCode nvarchar(6) COLLATE Latin1_General_CI_AS NOT NULL,
	assignedToUnitDate datetime DEFAULT getutcdate() NOT NULL,
	CONSTRAINT PK_Patient PRIMARY KEY (id),
	CONSTRAINT FK_Patient_Unit FOREIGN KEY (unitFk) REFERENCES Silhouette.dbo.Unit(id)
);
 CREATE NONCLUSTERED INDEX IDX_Patient_DomainId ON Silhouette.dbo.Patient (  domainId ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IDX_Patient_FirstName ON Silhouette.dbo.Patient (  firstName ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IDX_Patient_LastName ON Silhouette.dbo.Patient (  lastName ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IDX_Patient_Unit ON Silhouette.dbo.Patient (  unitFk ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.PatientMergeLog definition

-- Drop table

-- DROP TABLE Silhouette.dbo.PatientMergeLog;

CREATE TABLE Silhouette.dbo.PatientMergeLog (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	sourcePatientFk uniqueidentifier NOT NULL,
	targetPatientFk uniqueidentifier NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	CONSTRAINT PK_PatientMergeLog PRIMARY KEY (id),
	CONSTRAINT FK_PatientMergeLog_SourcePatient FOREIGN KEY (sourcePatientFk) REFERENCES Silhouette.dbo.Patient(id),
	CONSTRAINT FK_PatientMergeLog_TargetPatient FOREIGN KEY (targetPatientFk) REFERENCES Silhouette.dbo.Patient(id)
);
 CREATE UNIQUE NONCLUSTERED INDEX IX_PatientMergeLog_sourcePatientFk_targetPatientFk ON Silhouette.dbo.PatientMergeLog (  sourcePatientFk ASC  , targetPatientFk ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.PatientNote definition

-- Drop table

-- DROP TABLE Silhouette.dbo.PatientNote;

CREATE TABLE Silhouette.dbo.PatientNote (
	id uniqueidentifier NOT NULL,
	patientFk uniqueidentifier NOT NULL,
	assessmentTypeVersionFk uniqueidentifier NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK__PatientNote PRIMARY KEY (id),
	CONSTRAINT FK__PatientNote__AssessmentTypeVersion FOREIGN KEY (assessmentTypeVersionFk) REFERENCES Silhouette.dbo.AssessmentTypeVersion(id),
	CONSTRAINT FK__PatientNote__Patient FOREIGN KEY (patientFk) REFERENCES Silhouette.dbo.Patient(id)
);
 CREATE NONCLUSTERED INDEX IX_PatientNote_AssessmentTypeVersion ON Silhouette.dbo.PatientNote (  assessmentTypeVersionFk ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE UNIQUE NONCLUSTERED INDEX IX_PatientNote_Patient_AssessmentTypeVersion ON Silhouette.dbo.PatientNote (  patientFk ASC  , assessmentTypeVersionFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.ProgressNote definition

-- Drop table

-- DROP TABLE Silhouette.dbo.ProgressNote;

CREATE TABLE Silhouette.dbo.ProgressNote (
	id uniqueidentifier NOT NULL,
	patientFk uniqueidentifier NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	createdInUnitFk uniqueidentifier NOT NULL,
	CONSTRAINT PK_ProgressNote PRIMARY KEY (id),
	CONSTRAINT FK_ProgressNote_Patient FOREIGN KEY (patientFk) REFERENCES Silhouette.dbo.Patient(id),
	CONSTRAINT FK_ProgressNote_Unit FOREIGN KEY (createdInUnitFk) REFERENCES Silhouette.dbo.Unit(id)
);
 CREATE NONCLUSTERED INDEX IX_ProgressNote_CreatedInUnitFk ON Silhouette.dbo.ProgressNote (  createdInUnitFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_ProgressNote_patientFk ON Silhouette.dbo.ProgressNote (  patientFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.RoleAssessmentType definition

-- Drop table

-- DROP TABLE Silhouette.dbo.RoleAssessmentType;

CREATE TABLE Silhouette.dbo.RoleAssessmentType (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	roleFk uniqueidentifier NOT NULL,
	assessmentTypeFk uniqueidentifier NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK_StaffGroupAssessmentType PRIMARY KEY (id),
	CONSTRAINT FK_RoleAssessmentType_AssessmentType FOREIGN KEY (assessmentTypeFk) REFERENCES Silhouette.dbo.AssessmentType(id),
	CONSTRAINT FK_RoleAssessmentType_StaffGroup FOREIGN KEY (roleFk) REFERENCES Silhouette.dbo.[Role](id)
);


-- Silhouette.dbo.RoleAssignableRoles definition

-- Drop table

-- DROP TABLE Silhouette.dbo.RoleAssignableRoles;

CREATE TABLE Silhouette.dbo.RoleAssignableRoles (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	roleFk uniqueidentifier NOT NULL,
	assignableRoleFk uniqueidentifier NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK_StaffGroupAssignableRoles PRIMARY KEY (id),
	CONSTRAINT FK_RoleAssignableRoles_AccessibleStaffGroupFk FOREIGN KEY (assignableRoleFk) REFERENCES Silhouette.dbo.[Role](id),
	CONSTRAINT FK_RoleAssignableRoles_StaffGroupFk FOREIGN KEY (roleFk) REFERENCES Silhouette.dbo.[Role](id)
);
 CREATE NONCLUSTERED INDEX IX_StaffGroupAssignableRolesRoles_StaffGroupFk ON Silhouette.dbo.RoleAssignableRoles (  roleFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.RoleDashboard definition

-- Drop table

-- DROP TABLE Silhouette.dbo.RoleDashboard;

CREATE TABLE Silhouette.dbo.RoleDashboard (
	id uniqueidentifier NOT NULL,
	roleFk uniqueidentifier NOT NULL,
	dashboardFk uniqueidentifier NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK__RoleDashboard PRIMARY KEY (id),
	CONSTRAINT FK__RoleDashboard__DashBoard FOREIGN KEY (dashboardFk) REFERENCES Silhouette.dbo.Dashboard(id),
	CONSTRAINT FK__RoleDashboard__Role FOREIGN KEY (roleFk) REFERENCES Silhouette.dbo.[Role](id)
);


-- Silhouette.dbo.StaffUser definition

-- Drop table

-- DROP TABLE Silhouette.dbo.StaffUser;

CREATE TABLE Silhouette.dbo.StaffUser (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	[login] nvarchar(128) COLLATE Latin1_General_CI_AS NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	status int DEFAULT 1 NOT NULL,
	statusChangeDate datetime DEFAULT CONVERT([datetime],'1980-01-01',(0)) NOT NULL,
	email nvarchar(255) COLLATE Latin1_General_CI_AS NULL,
	phone nvarchar(50) COLLATE Latin1_General_CI_AS NULL,
	middleName nvarchar(128) COLLATE Latin1_General_CI_AS NULL,
	firstName nvarchar(128) COLLATE Latin1_General_CI_AS NOT NULL,
	lastName nvarchar(128) COLLATE Latin1_General_CI_AS NOT NULL,
	detailsChangeDate datetime DEFAULT CONVERT([datetime],'1980-01-01',(0)) NOT NULL,
	externalAuthenticationProviderFk uniqueidentifier NULL,
	[type] smallint DEFAULT 0 NOT NULL,
	medicalCredentials nvarchar(128) COLLATE Latin1_General_CI_AS NULL,
	CONSTRAINT PK_User PRIMARY KEY (id),
	CONSTRAINT FK_StaffUser_ExternalAuthenticationProvider FOREIGN KEY (externalAuthenticationProviderFk) REFERENCES Silhouette.dbo.ExternalAuthenticationProvider(id)
);
 CREATE UNIQUE NONCLUSTERED INDEX IX_StaffUser_email ON Silhouette.dbo.StaffUser (  email ASC  )  
	 WHERE  ([email] IS NOT NULL AND [email]<>'' AND [isdeleted]=(0) AND [externalAuthenticationProviderFk] IS NULL)
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_StaffUser_login_externalAuthenticationProviderFk_isDeleted ON Silhouette.dbo.StaffUser (  login ASC  , externalAuthenticationProviderFk ASC  , isDeleted ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.StaffUserAccessGroup definition

-- Drop table

-- DROP TABLE Silhouette.dbo.StaffUserAccessGroup;

CREATE TABLE Silhouette.dbo.StaffUserAccessGroup (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	staffUserFk uniqueidentifier NOT NULL,
	accessGroupFk uniqueidentifier NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK__StaffUserAccessGroup PRIMARY KEY (id),
	CONSTRAINT FK__StaffUserAccessGroup__AccessGroup FOREIGN KEY (accessGroupFk) REFERENCES Silhouette.dbo.AccessGroup(id),
	CONSTRAINT FK__StaffUserAccessGroup__StaffUser FOREIGN KEY (staffUserFk) REFERENCES Silhouette.dbo.StaffUser(id)
);
 CREATE NONCLUSTERED INDEX IX_StaffUserAccessGroup_accessGroupFk ON Silhouette.dbo.StaffUserAccessGroup (  accessGroupFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_StaffUserAccessGroup_staffUserFk ON Silhouette.dbo.StaffUserAccessGroup (  staffUserFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.StaffUserPassword definition

-- Drop table

-- DROP TABLE Silhouette.dbo.StaffUserPassword;

CREATE TABLE Silhouette.dbo.StaffUserPassword (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	staffUserFk uniqueidentifier NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	password varbinary(100) NOT NULL,
	passwordSalt varbinary(32) NULL,
	passwordVersion int NOT NULL,
	lastPasswordChangeDate datetime NOT NULL,
	CONSTRAINT IX_StaffUserPassword_StaffUserFk UNIQUE (staffUserFk),
	CONSTRAINT PK_StaffUserPassword PRIMARY KEY (id),
	CONSTRAINT FK_StaffUser_StaffUserPassword FOREIGN KEY (staffUserFk) REFERENCES Silhouette.dbo.StaffUser(id)
);


-- Silhouette.dbo.StaffUserPatient definition

-- Drop table

-- DROP TABLE Silhouette.dbo.StaffUserPatient;

CREATE TABLE Silhouette.dbo.StaffUserPatient (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	staffUserFk uniqueidentifier NOT NULL,
	patientFk uniqueidentifier NOT NULL,
	accessStatus smallint DEFAULT 0 NOT NULL,
	invalidAccessAttempts int DEFAULT 0 NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	CONSTRAINT PK_StaffUserPatient PRIMARY KEY (id),
	CONSTRAINT FK_StaffUserPatient_Patient FOREIGN KEY (patientFk) REFERENCES Silhouette.dbo.Patient(id),
	CONSTRAINT FK_StaffUserPatient_StaffUser FOREIGN KEY (staffUserFk) REFERENCES Silhouette.dbo.StaffUser(id)
);


-- Silhouette.dbo.StaffUserPatientShortlistPin definition

-- Drop table

-- DROP TABLE Silhouette.dbo.StaffUserPatientShortlistPin;

CREATE TABLE Silhouette.dbo.StaffUserPatientShortlistPin (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	staffUserFk uniqueidentifier NOT NULL,
	patientFk uniqueidentifier NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK__StaffUserPatientShortlistPin PRIMARY KEY (id),
	CONSTRAINT FK__StaffUserPatientShortlistPin__Patient FOREIGN KEY (patientFk) REFERENCES Silhouette.dbo.Patient(id),
	CONSTRAINT FK__StaffUserPatientShortlistPin__StaffUser FOREIGN KEY (staffUserFk) REFERENCES Silhouette.dbo.StaffUser(id)
);
 CREATE NONCLUSTERED INDEX IX_StaffUserPatientShortlistPin_patientFk ON Silhouette.dbo.StaffUserPatientShortlistPin (  patientFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_StaffUserPatientShortlistPin_staffUserFk ON Silhouette.dbo.StaffUserPatientShortlistPin (  staffUserFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.StaffUserRecipientGroup definition

-- Drop table

-- DROP TABLE Silhouette.dbo.StaffUserRecipientGroup;

CREATE TABLE Silhouette.dbo.StaffUserRecipientGroup (
	staffUserFk uniqueidentifier NOT NULL,
	id uniqueidentifier DEFAULT newid() NOT NULL,
	recipientGroupFk uniqueidentifier NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	CONSTRAINT PK_StaffUserEmailRecipientGroup PRIMARY KEY (id),
	CONSTRAINT FK_StaffUserEmailRecipientGroup_EmailRecipientGroup FOREIGN KEY (recipientGroupFk) REFERENCES Silhouette.dbo.RecipientGroup(id),
	CONSTRAINT FK_StaffUserEmailRecipientGroup_StaffUser FOREIGN KEY (staffUserFk) REFERENCES Silhouette.dbo.StaffUser(id)
);


-- Silhouette.dbo.StaffUserRole definition

-- Drop table

-- DROP TABLE Silhouette.dbo.StaffUserRole;

CREATE TABLE Silhouette.dbo.StaffUserRole (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	staffUserFk uniqueidentifier NOT NULL,
	roleFk uniqueidentifier NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK__StaffUserStaffGroup PRIMARY KEY (id),
	CONSTRAINT FK__StaffUserRole__StaffGroup FOREIGN KEY (roleFk) REFERENCES Silhouette.dbo.[Role](id),
	CONSTRAINT FK__StaffUserRole__StaffUser FOREIGN KEY (staffUserFk) REFERENCES Silhouette.dbo.StaffUser(id)
);
 CREATE NONCLUSTERED INDEX IX_StaffUserStaffGroup_staffGroupFk ON Silhouette.dbo.StaffUserRole (  roleFk ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_StaffUserStaffGroup_staffUserFk ON Silhouette.dbo.StaffUserRole (  staffUserFk ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.StaffUserSettings definition

-- Drop table

-- DROP TABLE Silhouette.dbo.StaffUserSettings;

CREATE TABLE Silhouette.dbo.StaffUserSettings (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	staffUserFk uniqueidentifier NOT NULL,
	lastNetworkFk uniqueidentifier NULL,
	lastQueuedWelcomeEmailDate datetimeoffset NULL,
	showMobile2DFirstUse bit DEFAULT 1 NOT NULL,
	showMobile3DFirstUse bit DEFAULT 1 NOT NULL,
	serverChangeDate datetime DEFAULT getdate() NOT NULL,
	defaultFiducialTypeFk uniqueidentifier NULL,
	modSyncState int DEFAULT 1 NOT NULL,
	CONSTRAINT PK__StaffUserSettings PRIMARY KEY (id),
	CONSTRAINT FK__StaffUserSettings__defaultFiducialTypeFk FOREIGN KEY (defaultFiducialTypeFk) REFERENCES Silhouette.dbo.FiducialType(id),
	CONSTRAINT FK__StaffUserSettings__lastNetworkFk FOREIGN KEY (lastNetworkFk) REFERENCES Silhouette.dbo.NetworkConfiguration(id),
	CONSTRAINT FK__StaffUserSettings__userFk FOREIGN KEY (staffUserFk) REFERENCES Silhouette.dbo.StaffUser(id)
);
 CREATE NONCLUSTERED INDEX IX_StaffUserSettings_staffUserFk ON Silhouette.dbo.StaffUserSettings (  staffUserFk ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.UpdatedPatient definition

-- Drop table

-- DROP TABLE Silhouette.dbo.UpdatedPatient;

CREATE TABLE Silhouette.dbo.UpdatedPatient (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	patientFk uniqueidentifier NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	CONSTRAINT PK_UpdatedPatientId PRIMARY KEY (id),
	CONSTRAINT FK_UpdatedPatient_Patient FOREIGN KEY (patientFk) REFERENCES Silhouette.dbo.Patient(id)
);


-- Silhouette.dbo.ViewLog definition

-- Drop table

-- DROP TABLE Silhouette.dbo.ViewLog;

CREATE TABLE Silhouette.dbo.ViewLog (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	staffUserFk uniqueidentifier NULL,
	viewedDate datetime NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	activityType int DEFAULT 0 NOT NULL,
	clientId nvarchar(64) COLLATE Latin1_General_CI_AS NULL,
	CONSTRAINT PK_ViewLog PRIMARY KEY (id),
	CONSTRAINT FK_ViewLog_StaffUser FOREIGN KEY (staffUserFk) REFERENCES Silhouette.dbo.StaffUser(id)
);
 CREATE NONCLUSTERED INDEX IX_ViewLog_StaffUserFk ON Silhouette.dbo.ViewLog (  staffUserFk ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_ViewLog_ViewedDate ON Silhouette.dbo.ViewLog (  viewedDate ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.ViewLogPatient definition

-- Drop table

-- DROP TABLE Silhouette.dbo.ViewLogPatient;

CREATE TABLE Silhouette.dbo.ViewLogPatient (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	patientFk uniqueidentifier NOT NULL,
	viewLogFk uniqueidentifier NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	deviceFk uniqueidentifier NULL,
	CONSTRAINT PK_ViewLogPatient PRIMARY KEY (id),
	CONSTRAINT FK_ViewLogPatient_Patient FOREIGN KEY (patientFk) REFERENCES Silhouette.dbo.Patient(id),
	CONSTRAINT FK_ViewLogPatient_ViewLog FOREIGN KEY (viewLogFk) REFERENCES Silhouette.dbo.ViewLog(id),
	CONSTRAINT FK__ViewLogPatient__Device FOREIGN KEY (deviceFk) REFERENCES Silhouette.dbo.Device(id)
);
 CREATE NONCLUSTERED INDEX IX_ViewLogPatient_PatientFk ON Silhouette.dbo.ViewLogPatient (  patientFk ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_ViewLogPatient_ViewLogFk ON Silhouette.dbo.ViewLogPatient (  viewLogFk ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.Wound definition

-- Drop table

-- DROP TABLE Silhouette.dbo.Wound;

CREATE TABLE Silhouette.dbo.Wound (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	patientFk uniqueidentifier NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	anatomyFk uniqueidentifier NOT NULL,
	auxText nvarchar(255) COLLATE Latin1_General_CI_AS NOT NULL,
	woundIndex int NULL,
	lastCentralChangeDate datetime DEFAULT getutcdate() NOT NULL,
	baselineDate datetimeoffset NOT NULL,
	baselineTimeZoneId nvarchar(64) COLLATE Latin1_General_CI_AS NOT NULL,
	CONSTRAINT PK_Wound PRIMARY KEY (id),
	CONSTRAINT FK_Wound_Anatomy FOREIGN KEY (anatomyFk) REFERENCES Silhouette.dbo.Anatomy(id),
	CONSTRAINT FK_Wound_Patient FOREIGN KEY (patientFk) REFERENCES Silhouette.dbo.Patient(id)
);
 CREATE NONCLUSTERED INDEX IX_Wound_PatientFk ON Silhouette.dbo.Wound (  patientFk ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.AuditLogAction definition

-- Drop table

-- DROP TABLE Silhouette.dbo.AuditLogAction;

CREATE TABLE Silhouette.dbo.AuditLogAction (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	description nvarchar(256) COLLATE Latin1_General_CI_AS NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	actionDate datetime DEFAULT getutcdate() NOT NULL,
	centralDate datetime NULL,
	deviceFk uniqueidentifier NULL,
	clientIp nvarchar(64) COLLATE Latin1_General_CI_AS NULL,
	objectId uniqueidentifier NULL,
	unitFk uniqueidentifier NULL,
	staffUserFk uniqueidentifier NULL,
	clientId nvarchar(64) COLLATE Latin1_General_CI_AS NULL,
	rolledBack bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK_AuditLogAction PRIMARY KEY (id),
	CONSTRAINT FK__AuditLogAction__Device FOREIGN KEY (deviceFk) REFERENCES Silhouette.dbo.Device(id),
	CONSTRAINT FK__AuditLogAction__StaffUser FOREIGN KEY (staffUserFk) REFERENCES Silhouette.dbo.StaffUser(id),
	CONSTRAINT FK__AuditLogAction__Unit FOREIGN KEY (unitFk) REFERENCES Silhouette.dbo.Unit(id)
);
 CREATE NONCLUSTERED INDEX IX_AuditLogAction_actionDate ON Silhouette.dbo.AuditLogAction (  actionDate ASC  )  
	 INCLUDE ( objectId , staffUserFk ) 
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_AuditLogAction_objectId_actionDate ON Silhouette.dbo.AuditLogAction (  objectId ASC  , actionDate ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_AuditLogAction_unitFk ON Silhouette.dbo.AuditLogAction (  unitFk ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.AuditLogActionType definition

-- Drop table

-- DROP TABLE Silhouette.dbo.AuditLogActionType;

CREATE TABLE Silhouette.dbo.AuditLogActionType (
	id uniqueidentifier NOT NULL,
	[action] int NOT NULL,
	auditLogActionFk uniqueidentifier NOT NULL,
	child bit NOT NULL,
	objectId uniqueidentifier NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	CONSTRAINT PK__AuditLogActionType PRIMARY KEY (id),
	CONSTRAINT FK__AuditLogActionType__AuditLogAction FOREIGN KEY (auditLogActionFk) REFERENCES Silhouette.dbo.AuditLogAction(id)
);
 CREATE NONCLUSTERED INDEX IX_AuditLogActionType_action ON Silhouette.dbo.AuditLogActionType (  action ASC  )  
	 INCLUDE ( auditLogActionFk ) 
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_AuditLogActionType_auditLogActionFk ON Silhouette.dbo.AuditLogActionType (  auditLogActionFk ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.ClinicalExport definition

-- Drop table

-- DROP TABLE Silhouette.dbo.ClinicalExport;

CREATE TABLE Silhouette.dbo.ClinicalExport (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	exportType int NOT NULL,
	status int DEFAULT 0 NOT NULL,
	createdDateTime datetime NOT NULL,
	fromDateTime datetimeoffset NULL,
	toDateTime datetimeoffset NULL,
	fileName nvarchar(128) COLLATE Latin1_General_CI_AS NULL,
	hangFireJobId nvarchar(128) COLLATE Latin1_General_CI_AS NULL,
	patientFk uniqueidentifier NULL,
	staffUserFk uniqueidentifier NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDataArchive bit DEFAULT 0 NOT NULL,
	assessmentTypeVersionFk uniqueidentifier NOT NULL,
	CONSTRAINT PK_ClinicalExport PRIMARY KEY (id),
	CONSTRAINT FK_ClinicalExport_AssessmentTypeVersion FOREIGN KEY (assessmentTypeVersionFk) REFERENCES Silhouette.dbo.AssessmentTypeVersion(id),
	CONSTRAINT FK_ClinicalExport_Patient FOREIGN KEY (patientFk) REFERENCES Silhouette.dbo.Patient(id),
	CONSTRAINT FK_ClinicalExport_StaffUser FOREIGN KEY (staffUserFk) REFERENCES Silhouette.dbo.StaffUser(id)
);


-- Silhouette.dbo.ClinicalExportUnit definition

-- Drop table

-- DROP TABLE Silhouette.dbo.ClinicalExportUnit;

CREATE TABLE Silhouette.dbo.ClinicalExportUnit (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	clinicalExportFk uniqueidentifier NOT NULL,
	unitFk uniqueidentifier NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	CONSTRAINT PK_ClinicalExportUnit PRIMARY KEY (id),
	CONSTRAINT FK_ClinicalExportUnit_ClinicalExport FOREIGN KEY (clinicalExportFk) REFERENCES Silhouette.dbo.ClinicalExport(id),
	CONSTRAINT FK_ClinicalExportUnit_Unit FOREIGN KEY (unitFk) REFERENCES Silhouette.dbo.Unit(id)
);


-- Silhouette.dbo.DataArchive definition

-- Drop table

-- DROP TABLE Silhouette.dbo.DataArchive;

CREATE TABLE Silhouette.dbo.DataArchive (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	status int DEFAULT 0 NOT NULL,
	name nvarchar(10) COLLATE Latin1_General_CI_AS NOT NULL,
	outputFilePath nvarchar(MAX) COLLATE Latin1_General_CI_AS NOT NULL,
	hangFireJobId nvarchar(128) COLLATE Latin1_General_CI_AS NULL,
	createdDateTime datetime NOT NULL,
	createdStaffUserFk uniqueidentifier NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	CONSTRAINT PK_DataArchive PRIMARY KEY (id),
	CONSTRAINT FK_DataArchive_StaffUser FOREIGN KEY (createdStaffUserFk) REFERENCES Silhouette.dbo.StaffUser(id)
);


-- Silhouette.dbo.DataArchiveUnit definition

-- Drop table

-- DROP TABLE Silhouette.dbo.DataArchiveUnit;

CREATE TABLE Silhouette.dbo.DataArchiveUnit (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	dataArchiveFk uniqueidentifier NOT NULL,
	unitFk uniqueidentifier NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	CONSTRAINT PK_DataArchiveUnit PRIMARY KEY (id),
	CONSTRAINT FK_DataArchiveUnit_DataArchive FOREIGN KEY (dataArchiveFk) REFERENCES Silhouette.dbo.DataArchive(id),
	CONSTRAINT FK_DataArchiveUnit_Unit FOREIGN KEY (unitFk) REFERENCES Silhouette.dbo.Unit(id)
);


-- Silhouette.dbo.DefaultUnitFilter definition

-- Drop table

-- DROP TABLE Silhouette.dbo.DefaultUnitFilter;

CREATE TABLE Silhouette.dbo.DefaultUnitFilter (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	userFk uniqueidentifier NOT NULL,
	units nvarchar(MAX) COLLATE Latin1_General_CI_AS NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	ApplyShortlistFilter bit DEFAULT 0 NOT NULL,
	dateOfBirth datetime NULL,
	CONSTRAINT PK_DefaultUnitFilter PRIMARY KEY (id),
	CONSTRAINT FK_DefaultUnitFilter_StaffUser FOREIGN KEY (userFk) REFERENCES Silhouette.dbo.StaffUser(id)
);


-- Silhouette.dbo.Encounter definition

-- Drop table

-- DROP TABLE Silhouette.dbo.Encounter;

CREATE TABLE Silhouette.dbo.Encounter (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	patientFk uniqueidentifier NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	assessmentTypeVersionFk uniqueidentifier NOT NULL,
	CONSTRAINT PK_Encounter PRIMARY KEY (id),
	CONSTRAINT FK_Encounter_AssessmentTypeVersion FOREIGN KEY (assessmentTypeVersionFk) REFERENCES Silhouette.dbo.AssessmentTypeVersion(id),
	CONSTRAINT FK_Encounter_Patient FOREIGN KEY (patientFk) REFERENCES Silhouette.dbo.Patient(id)
);
 CREATE NONCLUSTERED INDEX IX_Encounter_AssessmentTypeVersionFk ON Silhouette.dbo.Encounter (  assessmentTypeVersionFk ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_Encounter_patientFk ON Silhouette.dbo.Encounter (  patientFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.LoginAttemptLog definition

-- Drop table

-- DROP TABLE Silhouette.dbo.LoginAttemptLog;

CREATE TABLE Silhouette.dbo.LoginAttemptLog (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	staffUserFk uniqueidentifier NULL,
	[login] nvarchar(128) COLLATE Latin1_General_CI_AS NOT NULL,
	dateOccurred datetime NOT NULL,
	reason int NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	clientId nvarchar(64) COLLATE Latin1_General_CI_AS NULL,
	provider nvarchar(64) COLLATE Latin1_General_CI_AS NULL,
	CONSTRAINT PK_LoginAttemptLog PRIMARY KEY (id),
	CONSTRAINT FK_LoginAttemptLog_StaffUser FOREIGN KEY (staffUserFk) REFERENCES Silhouette.dbo.StaffUser(id)
);
 CREATE NONCLUSTERED INDEX IX_LoginAttemptLog_DateOccurred ON Silhouette.dbo.LoginAttemptLog (  dateOccurred ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_LoginAttemptLog_StaffUserFk ON Silhouette.dbo.LoginAttemptLog (  staffUserFk ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.LookupType definition

-- Drop table

-- DROP TABLE Silhouette.dbo.LookupType;

CREATE TABLE Silhouette.dbo.LookupType (
	id uniqueidentifier NOT NULL,
	name nvarchar(50) COLLATE Latin1_General_CI_AS NOT NULL,
	description nvarchar(256) COLLATE Latin1_General_CI_AS NULL,
	lookupItemCount int DEFAULT 0 NOT NULL,
	lastUpdated datetime NULL,
	lastUpdatedByStaffUserFk uniqueidentifier NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	CONSTRAINT PK_LookupType PRIMARY KEY (id),
	CONSTRAINT FK_LookupType_StaffUser FOREIGN KEY (lastUpdatedByStaffUserFk) REFERENCES Silhouette.dbo.StaffUser(id)
);
 CREATE UNIQUE NONCLUSTERED INDEX IX_LookupType_name ON Silhouette.dbo.LookupType (  name ASC  )  
	 WHERE  ([isdeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 100  ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.[Order] definition

-- Drop table

-- DROP TABLE Silhouette.dbo.[Order];

CREATE TABLE Silhouette.dbo.[Order] (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	encounterFk uniqueidentifier NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	lastCentralChangeDate datetime DEFAULT getutcdate() NOT NULL,
	orderId nvarchar(256) COLLATE Latin1_General_CI_AS NOT NULL,
	scheduledDateUtc datetime NOT NULL,
	status int NOT NULL,
	description nvarchar(MAX) COLLATE Latin1_General_CI_AS NOT NULL,
	expectedAssessmentTypeFk uniqueidentifier NULL,
	maxAssessments int NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	assessmentTypeVersionFk uniqueidentifier NOT NULL,
	CONSTRAINT PK_Order PRIMARY KEY (id),
	CONSTRAINT FK_Order_AssessmentType FOREIGN KEY (expectedAssessmentTypeFk) REFERENCES Silhouette.dbo.AssessmentType(id),
	CONSTRAINT FK_Order_AssessmentTypeVersion FOREIGN KEY (assessmentTypeVersionFk) REFERENCES Silhouette.dbo.AssessmentTypeVersion(id),
	CONSTRAINT FK_Order_Encounter FOREIGN KEY (encounterFk) REFERENCES Silhouette.dbo.Encounter(id)
);
 CREATE NONCLUSTERED INDEX IX_Order_AssessmentTypeVersionFk ON Silhouette.dbo.Order (  assessmentTypeVersionFk ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_Order_encounterFk ON Silhouette.dbo.Order (  encounterFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.PasswordHistory definition

-- Drop table

-- DROP TABLE Silhouette.dbo.PasswordHistory;

CREATE TABLE Silhouette.dbo.PasswordHistory (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	staffUserFk uniqueidentifier NOT NULL,
	password varbinary(100) NOT NULL,
	lastUsed datetime NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	passwordSalt varbinary(32) NULL,
	passwordVersion int NOT NULL,
	CONSTRAINT PK_PasswordHistory PRIMARY KEY (id),
	CONSTRAINT FK_PasswordHistory_StaffUser FOREIGN KEY (staffUserFk) REFERENCES Silhouette.dbo.StaffUser(id)
);


-- Silhouette.dbo.PatientShortlistCriteria definition

-- Drop table

-- DROP TABLE Silhouette.dbo.PatientShortlistCriteria;

CREATE TABLE Silhouette.dbo.PatientShortlistCriteria (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	viewedWithinDays int NOT NULL,
	assignedToUnitWithinDays int NOT NULL,
	pinsExpireAfterDays int NOT NULL,
	staffUserFk uniqueidentifier NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK__PatientFilterCriteria PRIMARY KEY (id),
	CONSTRAINT FK__PatientShortlistCriteria__staffUserFk FOREIGN KEY (staffUserFk) REFERENCES Silhouette.dbo.StaffUser(id)
);
 CREATE UNIQUE NONCLUSTERED INDEX UX_PatientShortlistCriteria_staffUserFk ON Silhouette.dbo.PatientShortlistCriteria (  staffUserFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.PatientUnitFilter definition

-- Drop table

-- DROP TABLE Silhouette.dbo.PatientUnitFilter;

CREATE TABLE Silhouette.dbo.PatientUnitFilter (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	staffUserFk uniqueidentifier NOT NULL,
	unitFk uniqueidentifier NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	CONSTRAINT PK__PatientUnitFilter PRIMARY KEY (id),
	CONSTRAINT FK__PatientUnitFilter__staffUserFk FOREIGN KEY (staffUserFk) REFERENCES Silhouette.dbo.StaffUser(id),
	CONSTRAINT FK__PatientUnitFilter__unitk FOREIGN KEY (unitFk) REFERENCES Silhouette.dbo.Unit(id)
);


-- Silhouette.dbo.ProgressNoteRevision definition

-- Drop table

-- DROP TABLE Silhouette.dbo.ProgressNoteRevision;

CREATE TABLE Silhouette.dbo.ProgressNoteRevision (
	id uniqueidentifier NOT NULL,
	progressNoteFk uniqueidentifier NOT NULL,
	revision smallint NOT NULL,
	generatedDate datetimeoffset NOT NULL,
	timeZoneId nvarchar(64) COLLATE Latin1_General_CI_AS NOT NULL,
	fileName nvarchar(128) COLLATE Latin1_General_CI_AS NOT NULL,
	signedByStaffUserFk uniqueidentifier NOT NULL,
	signedByName nvarchar(384) COLLATE Latin1_General_CI_AS NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK_ProgressNoteRevision PRIMARY KEY (id),
	CONSTRAINT FK_ProgressNoteRevision_ProgressNote FOREIGN KEY (progressNoteFk) REFERENCES Silhouette.dbo.ProgressNote(id),
	CONSTRAINT FK_ProgressNoteRevision_StaffUser FOREIGN KEY (signedByStaffUserFk) REFERENCES Silhouette.dbo.StaffUser(id)
);
 CREATE UNIQUE NONCLUSTERED INDEX IX_ProgressNoteRevision_progressNoteFk_progressNoteVersion ON Silhouette.dbo.ProgressNoteRevision (  progressNoteFk ASC  , revision ASC  )  
	 INCLUDE ( isDeleted ) 
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.ProgressNoteRevisionAssessmentType definition

-- Drop table

-- DROP TABLE Silhouette.dbo.ProgressNoteRevisionAssessmentType;

CREATE TABLE Silhouette.dbo.ProgressNoteRevisionAssessmentType (
	id uniqueidentifier NOT NULL,
	progressNoteRevisionFk uniqueidentifier NOT NULL,
	assessmentTypeFk uniqueidentifier NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK_ProgressNoteAssessmentType PRIMARY KEY (id),
	CONSTRAINT FK_ProgressNoteRevisionAssessmentType_AssessmentType FOREIGN KEY (assessmentTypeFk) REFERENCES Silhouette.dbo.AssessmentType(id),
	CONSTRAINT FK_ProgressNoteRevisionAssessmentType_ProgressNoteRevision FOREIGN KEY (progressNoteRevisionFk) REFERENCES Silhouette.dbo.ProgressNoteRevision(id)
);
 CREATE NONCLUSTERED INDEX IX_ProgressNoteRevisionAssessmentType_patientNoteFk ON Silhouette.dbo.ProgressNoteRevisionAssessmentType (  assessmentTypeFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_ProgressNoteRevisionAssessmentType_progressNoteRevisionFk ON Silhouette.dbo.ProgressNoteRevisionAssessmentType (  progressNoteRevisionFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.Series definition

-- Drop table

-- DROP TABLE Silhouette.dbo.Series;

CREATE TABLE Silhouette.dbo.Series (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	patientFk uniqueidentifier NOT NULL,
	woundFk uniqueidentifier NULL,
	[date] datetimeoffset NOT NULL,
	timeZoneId nvarchar(64) COLLATE Latin1_General_CI_AS NOT NULL,
	lastCentralChangeDate datetime DEFAULT getutcdate() NOT NULL,
	assessmentTypeVersionFk uniqueidentifier NOT NULL,
	createdInUnitFk uniqueidentifier NOT NULL,
	lastSavedAnatomyFk uniqueidentifier NULL,
	CONSTRAINT PK_Series PRIMARY KEY (id),
	CONSTRAINT FK_Series_AssessmentTypeVersion FOREIGN KEY (assessmentTypeVersionFk) REFERENCES Silhouette.dbo.AssessmentTypeVersion(id),
	CONSTRAINT FK_Series_Patient FOREIGN KEY (patientFk) REFERENCES Silhouette.dbo.Patient(id),
	CONSTRAINT FK_Series_Unit FOREIGN KEY (createdInUnitFk) REFERENCES Silhouette.dbo.Unit(id),
	CONSTRAINT FK_Series_Wound FOREIGN KEY (woundFk) REFERENCES Silhouette.dbo.Wound(id)
);
 CREATE NONCLUSTERED INDEX IX_Series_AssessmentTypeVersionFk ON Silhouette.dbo.Series (  assessmentTypeVersionFk ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_Series_CreatedInUnitFk ON Silhouette.dbo.Series (  createdInUnitFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_Series_Date ON Silhouette.dbo.Series (  date ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_Series_PatientFk_WoundFk ON Silhouette.dbo.Series (  patientFk ASC  , woundFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_Series_WoundFk ON Silhouette.dbo.Series (  woundFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.AssessmentSignature definition

-- Drop table

-- DROP TABLE Silhouette.dbo.AssessmentSignature;

CREATE TABLE Silhouette.dbo.AssessmentSignature (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	seriesFk uniqueidentifier NOT NULL,
	staffUserFk uniqueidentifier NOT NULL,
	fullName nvarchar(256) COLLATE Latin1_General_CI_AS NOT NULL,
	medicalCredentials nvarchar(128) COLLATE Latin1_General_CI_AS NULL,
	signedDate datetime NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK_AssessmentSignature PRIMARY KEY (id),
	CONSTRAINT FK_AssessmentSignature_Series FOREIGN KEY (seriesFk) REFERENCES Silhouette.dbo.Series(id),
	CONSTRAINT FK_AssessmentSignature_StaffUser FOREIGN KEY (staffUserFk) REFERENCES Silhouette.dbo.StaffUser(id)
);
 CREATE UNIQUE NONCLUSTERED INDEX UX_AssessmentSignature_SeriesFk ON Silhouette.dbo.AssessmentSignature (  seriesFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.AttributeType definition

-- Drop table

-- DROP TABLE Silhouette.dbo.AttributeType;

CREATE TABLE Silhouette.dbo.AttributeType (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	name nvarchar(128) COLLATE Latin1_General_CI_AS NOT NULL,
	dataType int NOT NULL,
	[minValue] decimal(18,4) NULL,
	[maxValue] decimal(18,4) NULL,
	attributeSetFk uniqueidentifier NOT NULL,
	orderIndex int NOT NULL,
	step decimal(18,4) NULL,
	unitString nvarchar(255) COLLATE Latin1_General_CI_AS NULL,
	isRequired bit DEFAULT 1 NOT NULL,
	isVisible bit DEFAULT 1 NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	variableName nvarchar(256) COLLATE Latin1_General_CI_AS NOT NULL,
	validationErrorMessage nvarchar(255) COLLATE Latin1_General_CI_AS NULL,
	isMultiLine bit DEFAULT 0 NOT NULL,
	fieldWidth int DEFAULT 0 NOT NULL,
	validationRegex nvarchar(255) COLLATE Latin1_General_CI_AS NULL,
	warnIfNotUnique bit DEFAULT 0 NOT NULL,
	export bit DEFAULT 1 NOT NULL,
	exportName nvarchar(256) COLLATE Latin1_General_CI_AS NOT NULL,
	visibilityExpression nvarchar(2048) COLLATE Latin1_General_CI_AS NULL,
	identifier bit NOT NULL,
	isPersistent bit DEFAULT 0 NOT NULL,
	imageCaptureSource smallint NULL,
	attributeTypeKey uniqueidentifier NOT NULL,
	acceptedFileTypes int NULL,
	calculatedValueExpression nvarchar(2048) COLLATE Latin1_General_CI_AS NULL,
	calculatedValueDecimalPlaces smallint NULL,
	isIdAutoGenerated bit DEFAULT 0 NOT NULL,
	idPrefix nvarchar(10) COLLATE Latin1_General_CI_AS NULL,
	idDigits smallint NULL,
	infoEditMode nvarchar(MAX) COLLATE Latin1_General_CI_AS NULL,
	infoViewMode nvarchar(MAX) COLLATE Latin1_General_CI_AS NULL,
	lookupTypeFk uniqueidentifier NULL,
	CONSTRAINT PK_AttributeType PRIMARY KEY (id),
	CONSTRAINT FK_AttributeType_AttributeSet FOREIGN KEY (attributeSetFk) REFERENCES Silhouette.dbo.AttributeSet(id),
	CONSTRAINT FK_AttributeType_LookupType FOREIGN KEY (lookupTypeFk) REFERENCES Silhouette.dbo.LookupType(id)
);
 CREATE NONCLUSTERED INDEX IX_AttributeType_AttributeSetFk ON Silhouette.dbo.AttributeType (  attributeSetFk ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_AttributeType_VariableName ON Silhouette.dbo.AttributeType (  variableName ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_AttributeType_attributeTypeKey ON Silhouette.dbo.AttributeType (  attributeTypeKey ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_AttributeType_lookupTypeFk ON Silhouette.dbo.AttributeType (  lookupTypeFk ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.AuditLog definition

-- Drop table

-- DROP TABLE Silhouette.dbo.AuditLog;

CREATE TABLE Silhouette.dbo.AuditLog (
	id uniqueidentifier DEFAULT newsequentialid() NOT NULL,
	auditLogControlFK uniqueidentifier NOT NULL,
	objectId uniqueidentifier NOT NULL,
	oldValue nvarchar(1000) COLLATE Latin1_General_CI_AS NULL,
	newValue nvarchar(1000) COLLATE Latin1_General_CI_AS NULL,
	newValueObjectId uniqueidentifier NULL,
	staffUserFk uniqueidentifier NULL,
	changedDate datetime NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	auditLogActionFk uniqueidentifier NULL,
	clientId nvarchar(64) COLLATE Latin1_General_CI_AS NULL,
	CONSTRAINT PK_AuditLog PRIMARY KEY (id),
	CONSTRAINT FK_AuditLog_AuditControl FOREIGN KEY (auditLogControlFK) REFERENCES Silhouette.dbo.AuditLogControl(id),
	CONSTRAINT FK_AuditLog_AuditLogAction FOREIGN KEY (auditLogActionFk) REFERENCES Silhouette.dbo.AuditLogAction(id)
);
 CREATE NONCLUSTERED INDEX IX_AuditLog_NewValueObjectId ON Silhouette.dbo.AuditLog (  newValueObjectId ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_AuditLog_ObjectId ON Silhouette.dbo.AuditLog (  objectId ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.EncounterAttribute definition

-- Drop table

-- DROP TABLE Silhouette.dbo.EncounterAttribute;

CREATE TABLE Silhouette.dbo.EncounterAttribute (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	encounterFk uniqueidentifier NOT NULL,
	attributeTypeFk uniqueidentifier NOT NULL,
	value nvarchar(MAX) COLLATE Latin1_General_CI_AS NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK_EncounterAttribute PRIMARY KEY (id),
	CONSTRAINT FK_EncounterAttribute_AttributeType FOREIGN KEY (attributeTypeFk) REFERENCES Silhouette.dbo.AttributeType(id),
	CONSTRAINT FK_EncounterAttribute_Encounter FOREIGN KEY (encounterFk) REFERENCES Silhouette.dbo.Encounter(id)
);
 CREATE NONCLUSTERED INDEX IX_EncounterAttribute_encounterFk ON Silhouette.dbo.EncounterAttribute (  encounterFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_EncounterAttribuute_attributeTypeFk ON Silhouette.dbo.EncounterAttribute (  attributeTypeFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.ImageCaptureValidation definition

-- Drop table

-- DROP TABLE Silhouette.dbo.ImageCaptureValidation;

CREATE TABLE Silhouette.dbo.ImageCaptureValidation (
	id uniqueidentifier NOT NULL,
	attributeTypeFk uniqueidentifier NOT NULL,
	imageMin int NULL,
	imageMax int NULL,
	rulerMin int NULL,
	rulerMax int NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	outlineMin int NULL,
	outlineMax int NULL,
	CONSTRAINT PK_ImageCaptureValidation PRIMARY KEY (id),
	CONSTRAINT FK_ImageCaptureValidation_AttributeType FOREIGN KEY (attributeTypeFk) REFERENCES Silhouette.dbo.AttributeType(id)
);


-- Silhouette.dbo.LookupItem definition

-- Drop table

-- DROP TABLE Silhouette.dbo.LookupItem;

CREATE TABLE Silhouette.dbo.LookupItem (
	code nvarchar(50) COLLATE Latin1_General_CI_AS NOT NULL,
	lookupTypeFk uniqueidentifier NOT NULL,
	description nvarchar(256) COLLATE Latin1_General_CI_AS NOT NULL,
	searchDetails nvarchar(512) COLLATE Latin1_General_CI_AS NULL,
	CONSTRAINT UC_LookupItem_code_lookupTypeFk UNIQUE (code,lookupTypeFk),
	CONSTRAINT FK_LookupItem_LookupType FOREIGN KEY (lookupTypeFk) REFERENCES Silhouette.dbo.LookupType(id)
);
 CREATE NONCLUSTERED INDEX IX_LookupItem_LookupTypeFk ON Silhouette.dbo.LookupItem (  lookupTypeFk ASC  )  
	 INCLUDE ( code , description , searchDetails ) 
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.Message definition

-- Drop table

-- DROP TABLE Silhouette.dbo.Message;

CREATE TABLE Silhouette.dbo.Message (
	id uniqueidentifier NOT NULL,
	messageId nvarchar(128) COLLATE Latin1_General_CI_AS NOT NULL,
	patientFk uniqueidentifier NOT NULL,
	assessmentFk uniqueidentifier NULL,
	creationDate datetime NOT NULL,
	summary nvarchar(128) COLLATE Latin1_General_CI_AS NULL,
	viewedUserFk uniqueidentifier NULL,
	state int NOT NULL,
	assessmentTypeVersionFk uniqueidentifier NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK_Message PRIMARY KEY (id),
	CONSTRAINT FK_Message_AssessmentTypeVersion FOREIGN KEY (assessmentTypeVersionFk) REFERENCES Silhouette.dbo.AssessmentTypeVersion(id),
	CONSTRAINT FK_Message_Patient FOREIGN KEY (patientFk) REFERENCES Silhouette.dbo.Patient(id),
	CONSTRAINT FK_Message_Series FOREIGN KEY (assessmentFk) REFERENCES Silhouette.dbo.Series(id),
	CONSTRAINT FK_Message_StaffUser FOREIGN KEY (viewedUserFk) REFERENCES Silhouette.dbo.StaffUser(id)
);
 CREATE NONCLUSTERED INDEX IX_Message_assessmentFk ON Silhouette.dbo.Message (  assessmentFk ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_Message_assessmentTypeVersionFk ON Silhouette.dbo.Message (  assessmentTypeVersionFk ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_Message_creationDate ON Silhouette.dbo.Message (  creationDate ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_Message_messageId ON Silhouette.dbo.Message (  messageId ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_Message_patientFk ON Silhouette.dbo.Message (  patientFk ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_Message_state ON Silhouette.dbo.Message (  state ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.MessageAttribute definition

-- Drop table

-- DROP TABLE Silhouette.dbo.MessageAttribute;

CREATE TABLE Silhouette.dbo.MessageAttribute (
	id uniqueidentifier NOT NULL,
	attributeTypeFk uniqueidentifier NOT NULL,
	messageFk uniqueidentifier NOT NULL,
	value nvarchar(MAX) COLLATE Latin1_General_CI_AS NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK_MessageAttribute PRIMARY KEY (id),
	CONSTRAINT FK_MessageAttribute_AttributeType FOREIGN KEY (attributeTypeFk) REFERENCES Silhouette.dbo.AttributeType(id),
	CONSTRAINT FK_MessageAttribute_Message FOREIGN KEY (messageFk) REFERENCES Silhouette.dbo.Message(id)
);
 CREATE NONCLUSTERED INDEX IX_MessageAttribute_attributeTypeFK ON Silhouette.dbo.MessageAttribute (  attributeTypeFk ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_MessageAttribute_messageFk ON Silhouette.dbo.MessageAttribute (  messageFk ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.MessageAttributeAttributeFile definition

-- Drop table

-- DROP TABLE Silhouette.dbo.MessageAttributeAttributeFile;

CREATE TABLE Silhouette.dbo.MessageAttributeAttributeFile (
	id uniqueidentifier NOT NULL,
	messageAttributeFk uniqueidentifier NOT NULL,
	attributeFileFk uniqueidentifier NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	CONSTRAINT PK_MessageAttributeAttributeFile PRIMARY KEY (id),
	CONSTRAINT FK_MessageAttributeAttributeFile_AttributeFile FOREIGN KEY (attributeFileFk) REFERENCES Silhouette.dbo.AttributeFile(id),
	CONSTRAINT FK_MessageAttributeAttributeFile_MessageAttribute FOREIGN KEY (messageAttributeFk) REFERENCES Silhouette.dbo.MessageAttribute(id)
);
 CREATE NONCLUSTERED INDEX IX_MessageAttributeAttributeFile_AttributeFile_MessageAttribute ON Silhouette.dbo.MessageAttributeAttributeFile (  attributeFileFk ASC  , messageAttributeFk ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_MessageAttributeAttributeFile_MessageAttributeFk ON Silhouette.dbo.MessageAttributeAttributeFile (  messageAttributeFk ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.OrderAttribute definition

-- Drop table

-- DROP TABLE Silhouette.dbo.OrderAttribute;

CREATE TABLE Silhouette.dbo.OrderAttribute (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	attributeTypeFk uniqueidentifier NOT NULL,
	orderFk uniqueidentifier NOT NULL,
	value nvarchar(MAX) COLLATE Latin1_General_CI_AS NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK_OrderNotes PRIMARY KEY (id),
	CONSTRAINT FK_OrderAttribute_AttributeType FOREIGN KEY (attributeTypeFk) REFERENCES Silhouette.dbo.AttributeType(id),
	CONSTRAINT FK_OrderAttribute_Order FOREIGN KEY (orderFk) REFERENCES Silhouette.dbo.[Order](id)
);
 CREATE NONCLUSTERED INDEX IX_OrderAttribute_attributeTypeFk ON Silhouette.dbo.OrderAttribute (  attributeTypeFk ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_OrderAttribute_orderFk ON Silhouette.dbo.OrderAttribute (  orderFk ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.OrderSeries definition

-- Drop table

-- DROP TABLE Silhouette.dbo.OrderSeries;

CREATE TABLE Silhouette.dbo.OrderSeries (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	orderFk uniqueidentifier NOT NULL,
	seriesFk uniqueidentifier NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK_OrderSeries PRIMARY KEY (id),
	CONSTRAINT FK_OrderSeries_Order FOREIGN KEY (orderFk) REFERENCES Silhouette.dbo.[Order](id),
	CONSTRAINT FK_OrderSeries_Series FOREIGN KEY (seriesFk) REFERENCES Silhouette.dbo.Series(id)
);
 CREATE NONCLUSTERED INDEX IX_OrderSeries_orderFk ON Silhouette.dbo.OrderSeries (  orderFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_OrderSeries_seriesFk ON Silhouette.dbo.OrderSeries (  seriesFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.PatientAttribute definition

-- Drop table

-- DROP TABLE Silhouette.dbo.PatientAttribute;

CREATE TABLE Silhouette.dbo.PatientAttribute (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	attributeTypeFk uniqueidentifier NOT NULL,
	value nvarchar(MAX) COLLATE Latin1_General_CI_AS NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	patientNoteFk uniqueidentifier NULL,
	CONSTRAINT PK_PatientAttribute PRIMARY KEY (id),
	CONSTRAINT FK_PatientAttribute_AttributeType FOREIGN KEY (attributeTypeFk) REFERENCES Silhouette.dbo.AttributeType(id),
	CONSTRAINT FK_PatientAttribute_PatientNote FOREIGN KEY (patientNoteFk) REFERENCES Silhouette.dbo.PatientNote(id)
);
 CREATE NONCLUSTERED INDEX IX_PatientAttribute_AttributeTypeFk ON Silhouette.dbo.PatientAttribute (  attributeTypeFk ASC  )  
	 INCLUDE ( value ) 
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE UNIQUE NONCLUSTERED INDEX IX_PatientAttribute_PatientNoteFk_AttributeTypeFk ON Silhouette.dbo.PatientAttribute (  patientNoteFk ASC  , attributeTypeFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.PatientAttributeAttributeFile definition

-- Drop table

-- DROP TABLE Silhouette.dbo.PatientAttributeAttributeFile;

CREATE TABLE Silhouette.dbo.PatientAttributeAttributeFile (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	patientAttributeFk uniqueidentifier NOT NULL,
	attributeFileFk uniqueidentifier NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	CONSTRAINT PK_PatientAttributeAttributeFile PRIMARY KEY (id),
	CONSTRAINT FK_PatientAttributeAttributeFile_AttributeFile FOREIGN KEY (attributeFileFk) REFERENCES Silhouette.dbo.AttributeFile(id),
	CONSTRAINT FK_PatientAttributeAttributeFile_PatientAttribute FOREIGN KEY (patientAttributeFk) REFERENCES Silhouette.dbo.PatientAttribute(id)
);
 CREATE UNIQUE NONCLUSTERED INDEX IX_PatientAttributeAttributeFile_AttributeFile_PatientAttribute ON Silhouette.dbo.PatientAttributeAttributeFile (  attributeFileFk ASC  , patientAttributeFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.PatientAttributeUserList definition

-- Drop table

-- DROP TABLE Silhouette.dbo.PatientAttributeUserList;

CREATE TABLE Silhouette.dbo.PatientAttributeUserList (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	patientAttributeFk uniqueidentifier NOT NULL,
	staffUserFk uniqueidentifier NULL,
	name nvarchar(400) COLLATE Latin1_General_CI_AS NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	CONSTRAINT PK_PatientAttributeUserList PRIMARY KEY (id),
	CONSTRAINT FK_PatientAttributeUserList_PatientAttribute FOREIGN KEY (patientAttributeFk) REFERENCES Silhouette.dbo.PatientAttribute(id),
	CONSTRAINT FK_PatientAttributeUserList_StaffUser FOREIGN KEY (staffUserFk) REFERENCES Silhouette.dbo.StaffUser(id)
);
 CREATE NONCLUSTERED INDEX IX_PatientAttributeUserList_PatientAttribute ON Silhouette.dbo.PatientAttributeUserList (  patientAttributeFk ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_PatientAttributeUserList_StaffUser ON Silhouette.dbo.PatientAttributeUserList (  staffUserFk ASC  )  
	 WHERE  ([staffUserFk] IS NOT NULL)
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.ProgressNoteRevisionSeries definition

-- Drop table

-- DROP TABLE Silhouette.dbo.ProgressNoteRevisionSeries;

CREATE TABLE Silhouette.dbo.ProgressNoteRevisionSeries (
	id uniqueidentifier NOT NULL,
	progressNoteRevisionFk uniqueidentifier NOT NULL,
	seriesFk uniqueidentifier NOT NULL,
	seriesServerChangeDate datetime NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK_ProgressNoteRevisionSeries PRIMARY KEY (id),
	CONSTRAINT FK_ProgressNoteRevisionSeries_ProgressNoteRevision FOREIGN KEY (progressNoteRevisionFk) REFERENCES Silhouette.dbo.ProgressNoteRevision(id),
	CONSTRAINT FK_ProgressNoteRevisionSeries_Series FOREIGN KEY (seriesFk) REFERENCES Silhouette.dbo.Series(id)
);
 CREATE NONCLUSTERED INDEX IX_ProgressNoteRevisionSeries_progressNoteRevisionFk ON Silhouette.dbo.ProgressNoteRevisionSeries (  progressNoteRevisionFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_ProgressNoteRevisionSeries_seriesFk ON Silhouette.dbo.ProgressNoteRevisionSeries (  seriesFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.SearchDefinitionAttributeType definition

-- Drop table

-- DROP TABLE Silhouette.dbo.SearchDefinitionAttributeType;

CREATE TABLE Silhouette.dbo.SearchDefinitionAttributeType (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	searchType int NOT NULL,
	attributeTypeFk uniqueidentifier NOT NULL,
	orderIndex int NOT NULL,
	isFilter bit NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	CONSTRAINT PK_SearchDefinitionAttributeType PRIMARY KEY (id),
	CONSTRAINT FK_SearchDefinitionAttributeType_AttributeType FOREIGN KEY (attributeTypeFk) REFERENCES Silhouette.dbo.AttributeType(id)
);


-- Silhouette.dbo.TimelineSummary definition

-- Drop table

-- DROP TABLE Silhouette.dbo.TimelineSummary;

CREATE TABLE Silhouette.dbo.TimelineSummary (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	assessmentTypeVersionFk uniqueidentifier NOT NULL,
	attributeTypeFk uniqueidentifier NOT NULL,
	label nvarchar(255) COLLATE Latin1_General_CI_AS NOT NULL,
	orderIndex int NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	CONSTRAINT PK_TimelineSummary PRIMARY KEY (id),
	CONSTRAINT FK_TimelineSummary_AssessmentTypeVersion FOREIGN KEY (assessmentTypeVersionFk) REFERENCES Silhouette.dbo.AssessmentTypeVersion(id),
	CONSTRAINT FK_TimelineSummary_AttributeType FOREIGN KEY (attributeTypeFk) REFERENCES Silhouette.dbo.AttributeType(id)
);
 CREATE UNIQUE NONCLUSTERED INDEX IX_TimelineSummary_AssessmentTypeVersionFK_AttributeTypeFK ON Silhouette.dbo.TimelineSummary (  assessmentTypeVersionFk ASC  , attributeTypeFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_TimelineSummary_AttributeTypeFK ON Silhouette.dbo.TimelineSummary (  attributeTypeFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.WoundAttribute definition

-- Drop table

-- DROP TABLE Silhouette.dbo.WoundAttribute;

CREATE TABLE Silhouette.dbo.WoundAttribute (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	attributeTypeFk uniqueidentifier NOT NULL,
	value nvarchar(MAX) COLLATE Latin1_General_CI_AS NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	seriesFk uniqueidentifier NOT NULL,
	CONSTRAINT PK_Attribute PRIMARY KEY (id),
	CONSTRAINT FK_Attribute_AttributeType FOREIGN KEY (attributeTypeFk) REFERENCES Silhouette.dbo.AttributeType(id),
	CONSTRAINT FK_WoundAttribute_Series FOREIGN KEY (seriesFk) REFERENCES Silhouette.dbo.Series(id)
);
 CREATE NONCLUSTERED INDEX IX_WoundAttribute_AttributeTypeFk ON Silhouette.dbo.WoundAttribute (  attributeTypeFk ASC  )  
	 INCLUDE ( isDeleted , seriesFk , value ) 
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_WoundAttribute_SeriesFk_AttributeTypeFk ON Silhouette.dbo.WoundAttribute (  seriesFk ASC  , attributeTypeFk ASC  )  
	 INCLUDE ( isDeleted , value ) 
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.WoundAttributeAttributeFile definition

-- Drop table

-- DROP TABLE Silhouette.dbo.WoundAttributeAttributeFile;

CREATE TABLE Silhouette.dbo.WoundAttributeAttributeFile (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	woundAttributeFk uniqueidentifier NOT NULL,
	attributeFileFk uniqueidentifier NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	CONSTRAINT PK_WoundAttributeAttributeFile PRIMARY KEY (id),
	CONSTRAINT FK_WoundAttributeAttributeFile_AttributeFile FOREIGN KEY (attributeFileFk) REFERENCES Silhouette.dbo.AttributeFile(id),
	CONSTRAINT FK_WoundAttributeAttributeFile_WoundAttribute FOREIGN KEY (woundAttributeFk) REFERENCES Silhouette.dbo.WoundAttribute(id)
);
 CREATE UNIQUE NONCLUSTERED INDEX IX_WoundAttributeAttributeFile_AttributeFile_WoundAttribute ON Silhouette.dbo.WoundAttributeAttributeFile (  attributeFileFk ASC  , woundAttributeFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.WoundAttributeUserList definition

-- Drop table

-- DROP TABLE Silhouette.dbo.WoundAttributeUserList;

CREATE TABLE Silhouette.dbo.WoundAttributeUserList (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	woundAttributeFk uniqueidentifier NOT NULL,
	staffUserFk uniqueidentifier NULL,
	name nvarchar(400) COLLATE Latin1_General_CI_AS NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	CONSTRAINT PK_WoundAttributeUserList PRIMARY KEY (id),
	CONSTRAINT FK_WoundAttributeUserList_PatientAttribute FOREIGN KEY (woundAttributeFk) REFERENCES Silhouette.dbo.WoundAttribute(id),
	CONSTRAINT FK_WoundAttributeUserList_StaffUser FOREIGN KEY (staffUserFk) REFERENCES Silhouette.dbo.StaffUser(id)
);
 CREATE NONCLUSTERED INDEX IX_WoundAttributeUserList_StaffUser ON Silhouette.dbo.WoundAttributeUserList (  staffUserFk ASC  )  
	 WHERE  ([staffUserFk] IS NOT NULL)
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_WoundAttributeUserList_WoundAttribute ON Silhouette.dbo.WoundAttributeUserList (  woundAttributeFk ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.AttributeLookup definition

-- Drop table

-- DROP TABLE Silhouette.dbo.AttributeLookup;

CREATE TABLE Silhouette.dbo.AttributeLookup (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	attributeTypeFk uniqueidentifier NOT NULL,
	[text] nvarchar(255) COLLATE Latin1_General_CI_AS NOT NULL,
	orderIndex int NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	value nvarchar(255) COLLATE Latin1_General_CI_AS DEFAULT NULL NULL,
	code nvarchar(128) COLLATE Latin1_General_CI_AS NULL,
	attributeLookupKey uniqueidentifier NOT NULL,
	CONSTRAINT PK_AttributeLookup PRIMARY KEY (id),
	CONSTRAINT FK_AttributeLookup_AttributeType FOREIGN KEY (attributeTypeFk) REFERENCES Silhouette.dbo.AttributeType(id)
);
 CREATE NONCLUSTERED INDEX IX_AttributeLookup_AttributeTypeFk ON Silhouette.dbo.AttributeLookup (  attributeTypeFk ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_AttributeLookup_attributeLookupKey ON Silhouette.dbo.AttributeLookup (  attributeLookupKey ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.AttributeSetValidation definition

-- Drop table

-- DROP TABLE Silhouette.dbo.AttributeSetValidation;

CREATE TABLE Silhouette.dbo.AttributeSetValidation (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	attributeSetFk uniqueidentifier NOT NULL,
	validationExpression nvarchar(4000) COLLATE Latin1_General_CI_AS NOT NULL,
	validationErrorMessage nvarchar(128) COLLATE Latin1_General_CI_AS NOT NULL,
	displayAttributeTypeFk uniqueidentifier NULL,
	evaluationOrder int NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK_AttributeSetValidation PRIMARY KEY (id),
	CONSTRAINT FK_AttributeSetValidation_AttributeSet1 FOREIGN KEY (attributeSetFk) REFERENCES Silhouette.dbo.AttributeSet(id),
	CONSTRAINT FK_AttributeSetValidation_AttributeType1 FOREIGN KEY (displayAttributeTypeFk) REFERENCES Silhouette.dbo.AttributeType(id)
);


-- Silhouette.dbo.ImageCapture definition

-- Drop table

-- DROP TABLE Silhouette.dbo.ImageCapture;

CREATE TABLE Silhouette.dbo.ImageCapture (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	[date] datetime NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	capturedByStaffUserFk uniqueidentifier NOT NULL,
	patientFk uniqueidentifier NOT NULL,
	imageFormatFk uniqueidentifier NOT NULL,
	isTraceable bit DEFAULT 1 NOT NULL,
	woundAttributeFk uniqueidentifier NULL,
	showInBucket bit NULL,
	width int NULL,
	height int NULL,
	deviceFk uniqueidentifier NULL,
	sourceImageCaptureFk uniqueidentifier NULL,
	CONSTRAINT PK_Image PRIMARY KEY (id),
	CONSTRAINT FK_ImageCapture_Device FOREIGN KEY (deviceFk) REFERENCES Silhouette.dbo.Device(id),
	CONSTRAINT FK_ImageCapture_ImageFormat FOREIGN KEY (imageFormatFk) REFERENCES Silhouette.dbo.ImageFormat(id),
	CONSTRAINT FK_ImageCapture_Patient FOREIGN KEY (patientFk) REFERENCES Silhouette.dbo.Patient(id),
	CONSTRAINT FK_ImageCapture_StaffUser FOREIGN KEY (capturedByStaffUserFk) REFERENCES Silhouette.dbo.StaffUser(id),
	CONSTRAINT FK_ImageCapture_WoundAttribute FOREIGN KEY (woundAttributeFk) REFERENCES Silhouette.dbo.WoundAttribute(id)
);
 CREATE NONCLUSTERED INDEX IX_ImageCapture_PatientFk ON Silhouette.dbo.ImageCapture (  patientFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_ImageCapture_WoundAttributeFk ON Silhouette.dbo.ImageCapture (  woundAttributeFk ASC  )  
	 INCLUDE ( isDeleted ) 
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.Mobile2DImageData definition

-- Drop table

-- DROP TABLE Silhouette.dbo.Mobile2DImageData;

CREATE TABLE Silhouette.dbo.Mobile2DImageData (
	id uniqueidentifier NOT NULL,
	state int DEFAULT 0 NOT NULL,
	acceptedByUser bit DEFAULT 0 NOT NULL,
	fiducialTypeFk uniqueidentifier NOT NULL,
	imageScale float NULL,
	imageCaptureFk uniqueidentifier NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK__Mobile2DImageData PRIMARY KEY (id),
	CONSTRAINT FK__Mobile2DImageData__FiducialType FOREIGN KEY (fiducialTypeFk) REFERENCES Silhouette.dbo.FiducialType(id),
	CONSTRAINT FK__Mobile2DImageData__ImageCapture FOREIGN KEY (imageCaptureFk) REFERENCES Silhouette.dbo.ImageCapture(id)
);
 CREATE NONCLUSTERED INDEX IX_Mobile2DImageData_imageCaptureFk ON Silhouette.dbo.Mobile2DImageData (  imageCaptureFk ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.Outline definition

-- Drop table

-- DROP TABLE Silhouette.dbo.Outline;

CREATE TABLE Silhouette.dbo.Outline (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	points image NOT NULL,
	pointCount smallint NOT NULL,
	area float NULL,
	perimeter float NULL,
	lengthAxis_length float NULL,
	lengthAxis_location image NULL,
	widthAxis_length float NULL,
	widthAxis_location image NULL,
	island bit DEFAULT 0 NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	imageCaptureFk uniqueidentifier NOT NULL,
	maxDepth float NULL,
	avgDepth float NULL,
	volume float NULL,
	axisExtentMethod smallint NULL,
	CONSTRAINT PK_Outline PRIMARY KEY (id),
	CONSTRAINT FK_Outline_ImageCapture FOREIGN KEY (imageCaptureFk) REFERENCES Silhouette.dbo.ImageCapture(id)
);
 CREATE NONCLUSTERED INDEX IX_Outline_ImageCaptureFk ON Silhouette.dbo.Outline (  imageCaptureFk ASC  )  
	 INCLUDE ( isDeleted ) 
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.OutlineDetectionLog definition

-- Drop table

-- DROP TABLE Silhouette.dbo.OutlineDetectionLog;

CREATE TABLE Silhouette.dbo.OutlineDetectionLog (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	imageCaptureFk uniqueidentifier NOT NULL,
	regionOfInterest varbinary(MAX) NULL,
	outputStatus int NOT NULL,
	outline varbinary(MAX) NOT NULL,
	settings nvarchar(2048) COLLATE Latin1_General_CI_AS NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	boundaryDetectionMethod smallint DEFAULT 1 NOT NULL,
	CONSTRAINT PK_OutlineDetectionLog PRIMARY KEY (id),
	CONSTRAINT FK_OutlineDetectionLog_ImageCapture FOREIGN KEY (imageCaptureFk) REFERENCES Silhouette.dbo.ImageCapture(id)
);


-- Silhouette.dbo.Ruler definition

-- Drop table

-- DROP TABLE Silhouette.dbo.Ruler;

CREATE TABLE Silhouette.dbo.Ruler (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	points image NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	imageCaptureFk uniqueidentifier NOT NULL,
	[length] float NULL,
	CONSTRAINT PK_Ruler PRIMARY KEY (id),
	CONSTRAINT FK_Ruler_ImageCapture FOREIGN KEY (imageCaptureFk) REFERENCES Silhouette.dbo.ImageCapture(id)
);
 CREATE NONCLUSTERED INDEX IX_Ruler_ImageCaptureFk ON Silhouette.dbo.Ruler (  imageCaptureFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.SurfaceModelImageSet definition

-- Drop table

-- DROP TABLE Silhouette.dbo.SurfaceModelImageSet;

CREATE TABLE Silhouette.dbo.SurfaceModelImageSet (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	state int NOT NULL,
	mainImageFk uniqueidentifier NULL,
	surfaceModelVersionFk uniqueidentifier NOT NULL,
	fiducialTypeFk uniqueidentifier NOT NULL,
	overridenParameters nvarchar(MAX) COLLATE Latin1_General_CI_AS NULL,
	processResult varbinary(MAX) NULL,
	errorLog nvarchar(MAX) COLLATE Latin1_General_CI_AS NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	processResultCode int NULL,
	acceptedByUser bit DEFAULT 0 NOT NULL,
	mainImageRotation smallint DEFAULT 0 NOT NULL,
	featureMatchingJobId nvarchar(50) COLLATE Latin1_General_CI_AS NULL,
	CONSTRAINT PK_SurfaceModelImageSet PRIMARY KEY (id),
	CONSTRAINT FK_SurfaceModelImageSet_FiducialType FOREIGN KEY (fiducialTypeFk) REFERENCES Silhouette.dbo.FiducialType(id),
	CONSTRAINT FK_SurfaceModelImageSet_ImageCapture FOREIGN KEY (mainImageFk) REFERENCES Silhouette.dbo.ImageCapture(id),
	CONSTRAINT FK_SurfaceModelImageSet_SurfaceModelVersion FOREIGN KEY (surfaceModelVersionFk) REFERENCES Silhouette.dbo.SurfaceModelVersion(id)
);
 CREATE NONCLUSTERED INDEX IX_SurfaceModelImageSet ON Silhouette.dbo.SurfaceModelImageSet (  mainImageFk ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.SurfaceModelMatchingResults definition

-- Drop table

-- DROP TABLE Silhouette.dbo.SurfaceModelMatchingResults;

CREATE TABLE Silhouette.dbo.SurfaceModelMatchingResults (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	surfaceModelImageSetFk uniqueidentifier NOT NULL,
	camera nvarchar(MAX) COLLATE Latin1_General_CI_AS NOT NULL,
	pointCloud nvarchar(MAX) COLLATE Latin1_General_CI_AS NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK_SurfaceModelMatchingResults_id PRIMARY KEY (id),
	CONSTRAINT FK_SurfaceModelMatchingResults_SurfaceModelImageSet FOREIGN KEY (surfaceModelImageSetFk) REFERENCES Silhouette.dbo.SurfaceModelImageSet(id)
);
 CREATE NONCLUSTERED INDEX IX_SurfaceModelMatchingResults_SurfaceModelImageSetFk ON Silhouette.dbo.SurfaceModelMatchingResults (  surfaceModelImageSetFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.WoundState definition

-- Drop table

-- DROP TABLE Silhouette.dbo.WoundState;

CREATE TABLE Silhouette.dbo.WoundState (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	attributeLookupFk uniqueidentifier NOT NULL,
	woundFk uniqueidentifier NOT NULL,
	seriesFk uniqueidentifier NULL,
	timeZoneId nvarchar(64) COLLATE Latin1_General_CI_AS NOT NULL,
	[date] datetimeoffset NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	lastCentralChangeDate datetime DEFAULT getutcdate() NOT NULL,
	assessmentTypeVersionFk uniqueidentifier NOT NULL,
	CONSTRAINT PK_WoundState PRIMARY KEY (id),
	CONSTRAINT FK_WoundState_AssessmentTypeVersion FOREIGN KEY (assessmentTypeVersionFk) REFERENCES Silhouette.dbo.AssessmentTypeVersion(id),
	CONSTRAINT FK_WoundState_AttributeLookup FOREIGN KEY (attributeLookupFk) REFERENCES Silhouette.dbo.AttributeLookup(id),
	CONSTRAINT FK_WoundState_Series FOREIGN KEY (seriesFk) REFERENCES Silhouette.dbo.Series(id),
	CONSTRAINT FK_WoundState_Wound FOREIGN KEY (woundFk) REFERENCES Silhouette.dbo.Wound(id)
);
 CREATE NONCLUSTERED INDEX IX_WoundState_AssessmentTypeVersionFk ON Silhouette.dbo.WoundState (  assessmentTypeVersionFk ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_WoundState_SeriesFk ON Silhouette.dbo.WoundState (  seriesFk ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_WoundState_WoundFk ON Silhouette.dbo.WoundState (  woundFk ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.WoundStateAttribute definition

-- Drop table

-- DROP TABLE Silhouette.dbo.WoundStateAttribute;

CREATE TABLE Silhouette.dbo.WoundStateAttribute (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	value nvarchar(MAX) COLLATE Latin1_General_CI_AS NOT NULL,
	attributeTypeFk uniqueidentifier NOT NULL,
	woundStateFk uniqueidentifier NOT NULL,
	CONSTRAINT PK_WoundStateAttribute PRIMARY KEY (id),
	CONSTRAINT FK_WoundStateAttribute_AttributeType FOREIGN KEY (attributeTypeFk) REFERENCES Silhouette.dbo.AttributeType(id),
	CONSTRAINT FK_WoundStateAttribute_WoundState FOREIGN KEY (woundStateFk) REFERENCES Silhouette.dbo.WoundState(id)
);
 CREATE NONCLUSTERED INDEX IX_WoundStateAttribute_WoundFk ON Silhouette.dbo.WoundStateAttribute (  woundStateFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.WoundStateDisplay definition

-- Drop table

-- DROP TABLE Silhouette.dbo.WoundStateDisplay;

CREATE TABLE Silhouette.dbo.WoundStateDisplay (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	attributeLookupFk uniqueidentifier NOT NULL,
	isActive bit NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	CONSTRAINT PK_WoundStateDisplay PRIMARY KEY (id),
	CONSTRAINT FK_WoundStateDisplay_AttributeLookup FOREIGN KEY (attributeLookupFk) REFERENCES Silhouette.dbo.AttributeLookup(id)
);


-- Silhouette.dbo.DetectedFiducial definition

-- Drop table

-- DROP TABLE Silhouette.dbo.DetectedFiducial;

CREATE TABLE Silhouette.dbo.DetectedFiducial (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	imageCaptureFk uniqueidentifier NOT NULL,
	edge1X float NOT NULL,
	edge1Y float NOT NULL,
	edge2X float NOT NULL,
	edge2Y float NOT NULL,
	centerX float NOT NULL,
	centerY float NOT NULL,
	points image NOT NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK_SurfaceModelDetectedFiducial_id PRIMARY KEY (id),
	CONSTRAINT FK_DetectedFiducial_ImageCapture FOREIGN KEY (imageCaptureFk) REFERENCES Silhouette.dbo.ImageCapture(id)
);
 CREATE NONCLUSTERED INDEX IX_DetectedFiducial_ImageCaptureFk ON Silhouette.dbo.DetectedFiducial (  imageCaptureFk ASC  )  
	 WHERE  ([isDeleted]=(0))
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 80   ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- Silhouette.dbo.SurfaceModelImage definition

-- Drop table

-- DROP TABLE Silhouette.dbo.SurfaceModelImage;

CREATE TABLE Silhouette.dbo.SurfaceModelImage (
	id uniqueidentifier DEFAULT newid() NOT NULL,
	surfaceModelImageSetFk uniqueidentifier NOT NULL,
	imageIndex int NOT NULL,
	state int NOT NULL,
	overridenParameters nvarchar(MAX) COLLATE Latin1_General_CI_AS NULL,
	processResult varbinary(MAX) NULL,
	errorLog nvarchar(MAX) COLLATE Latin1_General_CI_AS NULL,
	modSyncState int DEFAULT 2 NOT NULL,
	serverChangeDate datetime DEFAULT getutcdate() NOT NULL,
	isDeleted bit DEFAULT 0 NOT NULL,
	featureExtractionJobId nvarchar(50) COLLATE Latin1_General_CI_AS NULL,
	CONSTRAINT PK_SurfaceModelImage PRIMARY KEY (id),
	CONSTRAINT UK_SurfaceModelImage UNIQUE (surfaceModelImageSetFk,imageIndex),
	CONSTRAINT FK_SurfaceModelImage_SurfaceModelImageSet FOREIGN KEY (surfaceModelImageSetFk) REFERENCES Silhouette.dbo.SurfaceModelImageSet(id)
);


-- dbo.EncounterAttributeView source

CREATE OR ALTER VIEW [dbo].[EncounterAttributeView]
AS
SELECT dbo.EncounterAttribute.id,
       dbo.EncounterAttribute.value,
       dbo.EncounterAttribute.encounterFk,
       dbo.AttributeType.attributeTypeKey
FROM dbo.AttributeType
INNER JOIN dbo.EncounterAttribute ON dbo.AttributeType.id = dbo.EncounterAttribute.attributeTypeFk
WHERE  (dbo.EncounterAttribute.isDeleted = 0) AND (dbo.AttributeType.isDeleted = 0);


-- dbo.OrderAttributeView source

CREATE OR ALTER VIEW [dbo].[OrderAttributeView]
AS
SELECT dbo.AttributeType.attributeTypeKey,
       dbo.OrderAttribute.value,
       dbo.OrderAttribute.id,
       dbo.OrderAttribute.orderFk
FROM   dbo.OrderAttribute
  INNER JOIN dbo.AttributeType ON dbo.OrderAttribute.attributeTypeFk = dbo.AttributeType.id
WHERE  (dbo.OrderAttribute.isDeleted = 0) AND (dbo.AttributeType.isDeleted = 0);


-- dbo.OrderSearchDefinition source

CREATE OR ALTER VIEW [dbo].[OrderSearchDefinition]
AS

SELECT
  DISTINCT
  atype.attributeTypeKey,
  sdat.attributeTypeFk as attributeTypeId,
  QUOTENAME(sdat.attributeTypeFk) AS quotedName,
  sdat.isFilter,
  sdat.orderIndex,
  atype.dataType,
  PatientTableAttribute.quotedName AS patientColumnName,
  OrderTableAttribute.quotedName AS orderColumnName,
  CASE
    WHEN PatientTableAttribute.attributeTypeKey IS NOT NULL THEN 0
    WHEN NonPatientTableAttribute.attributeTypeKey IS NOT NULL THEN 1
    WHEN OrderTableAttribute.attributeTypeKey IS NOT NULL THEN 2
    WHEN NonOrderTableAttribute.attributeTypeKey IS NOT NULL THEN 3
    ELSE 4
    END AS [source]
FROM SearchDefinitionAttributeType sdat
  INNER JOIN AttributeType atype ON atype.id = sdat.attributeTypeFk
  INNER JOIN AttributeSet aset on aset.id = atype.attributeSetFk
  INNER JOIN AttributeSetAssessmentTypeVersion asatv on asatv.attributeSetFk = aset.id
  INNER JOIN AssessmentTypeVersion atv on atv.id = asatv.assessmentTypeVersionFk
  INNER JOIN AssessmentType ast on ast.id = atv.assessmentTypeFk
  LEFT JOIN dbo.fn_PatientTablePatientAttributes() PatientTableAttribute ON PatientTableAttribute.attributeTypeId = atype.id
  LEFT JOIN dbo.fn_OrderTableOrderAttributes() OrderTableAttribute ON OrderTableAttribute.attributeTypeId = atype.id
  LEFT JOIN dbo.fn_NonPatientTablePatientAttributes(0) NonPatientTableAttribute ON NonPatientTableAttribute.attributeTypeId = atype.id
  LEFT JOIN dbo.fn_NonOrderTableOrderAttributes() NonOrderTableAttribute ON NonOrderTableAttribute.attributeTypeId = atype.id
WHERE sdat.isDeleted = 0
  AND sdat.searchType = 1
  AND atype.isDeleted = 0
  AND atype.isVisible = 1
  AND ast.isDeleted = 0
  AND atv.isDeleted = 0
  AND asatv.isDeleted = 0;


-- dbo.PatientAttributeView source

CREATE OR ALTER VIEW [dbo].[PatientAttributeView]
AS
SELECT dbo.PatientAttribute.id, dbo.PatientAttribute.value, dbo.AttributeType.attributeTypeKey, dbo.PatientNote.patientFk
FROM dbo.PatientAttribute
  INNER JOIN dbo.AttributeType ON dbo.PatientAttribute.attributeTypeFk = dbo.AttributeType.id
  INNER JOIN dbo.PatientNote ON dbo.PatientAttribute.patientNoteFk = dbo.PatientNote.id
WHERE  (dbo.AttributeType.isDeleted = 0) AND (dbo.PatientAttribute.isDeleted = 0) AND (dbo.PatientNote.isDeleted = 0);


-- dbo.PatientLastViewedDate source

CREATE OR ALTER VIEW dbo.PatientLastViewedDate
AS

SELECT  p.id AS patientFk, vl.staffUserFk, MAX(vl.viewedDate) AS viewedDate
FROM    dbo.Patient p
          INNER JOIN dbo.ViewLogPatient vlp ON p.id = vlp.patientFk
          INNER JOIN dbo.ViewLog vl ON vlp.viewLogFk = vl.id
WHERE   p.isDeleted = 0
  AND vlp.isDeleted = 0
  AND vl.staffUserFk IS NOT NULL
GROUP BY p.id, vl.staffUserFk;