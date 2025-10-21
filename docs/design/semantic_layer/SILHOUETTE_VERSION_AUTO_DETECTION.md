# Silhouette Version Auto-Detection

## Overview

This feature automatically detects and populates the Silhouette Version when adding a new customer by querying their Silhouette database. The process includes connection validation and version detection in a two-step workflow.

## Version Mapping

The system queries the `dbo.Version` table in the customer's Silhouette database and retrieves the `SchemaVersion` column. This is then mapped to the corresponding Silhouette Version:

| Silhouette Version | Database Schema Version |
| ------------------ | ----------------------- |
| 4.18               | 35.0                    |
| 4.19               | 36.0                    |
| 4.20               | 37.0                    |
| 4.21               | 38.0                    |
| 4.22               | 39.0                    |

## Implementation

### Components Modified

1. **`lib/utils/silhouette-version-mapper.ts`** (NEW)

   - Utility for mapping database schema versions to Silhouette versions
   - Handles both decimal (35.0) and integer (35) formats
   - Provides validation and query functions

2. **`lib/services/customer-service.ts`**

   - Updated `runConnectionProbe()` to query `dbo.Version` table
   - Returns both `schemaVersionDetected` and `silhouetteVersionDetected`
   - Gracefully handles cases where version table doesn't exist

3. **`app/api/admin/customers/test-connection/route.ts`** (NEW)

   - API endpoint to test connection and detect version
   - Does not require an existing customer record
   - Used by UI to validate connections and detect versions

4. **`components/admin/CreateCustomerDialog.tsx`**
   - Silhouette Version field is now readonly
   - Added "Test Connection" button to validate connection and verify database accessibility
   - Added "Detect Version" button for auto-population (enabled only after connection test)
   - Shows connection status indicator (green checkmark) when valid
   - Provides user feedback via toast notifications with connection details

### User Experience Workflow

#### Step 1: Enter Customer Details

Admin enters:

- **Customer Name** <span style="color: red;">\*</span> (required)
- **Customer Code** <span style="color: red;">\*</span> (required)
- **Connection String** <span style="color: red;">\*</span> (required)
- **Deployment Type** (defaults to "ARANZ Office Host")
- **Silhouette Version** <span style="color: red;">\*</span> (auto-detected, required)

#### Step 2: Test Connection (NEW)

Admin clicks "Test Connection" button to:

- Validate the connection string format
- Verify database connectivity
- Check for required fields (server, database, user)
- Count available dbo and rpt tables
- **Automatically detect Silhouette version** if available
- Display success/error feedback via toast

**Success Feedback:**

- Shows green checkmark "✓ Connection OK"
- Toast displays: "Found X dbo tables and Y rpt tables"
- **Auto-detection**: If version is detected, shows "Version auto-detected" toast
- **Version field auto-populated** with detected version

**Error Feedback:**

- Specific error message explaining the connection failure
- Reasons could be: invalid credentials, unreachable server, missing database, etc.

#### Step 3: Manual Version Detection (Optional)

If auto-detection fails or version is not detected:

- Admin can click "Detect Version" button to retry
- Query `dbo.Version` table for `SchemaVersion`
- Map database version to Silhouette version
- Auto-populate the version field
- Provide feedback on detected version

**Success Feedback:**

- Version field auto-populated with detected version
- Toast displays: "Silhouette version X.XX detected (Schema version Y.Y)"

**Error Scenarios:**

- Version table doesn't exist: "Could not detect Silhouette version from database"
- Unknown schema version: "Schema version X.Y is not mapped to a Silhouette version"
- Connection lost during detection: "Connection failed" error

#### Step 4: Manual Override (Optional)

If auto-detection fails or is unavailable:

- Admin can manually enter the Silhouette version
- Note: Version field is readonly but can be cleared and manually edited if needed
- Proceed with customer creation once version is set

### Error Handling

The system handles several error scenarios gracefully:

| Scenario                  | User Action             | Feedback                                              |
| ------------------------- | ----------------------- | ----------------------------------------------------- |
| Connection string empty   | Test Connection clicked | Error: "Connection string required"                   |
| Invalid connection string | Test Connection clicked | Error: "Connection string is missing required fields" |
| Database unreachable      | Test Connection clicked | Error: Database-specific error message                |
| Connection not tested     | Detect Version clicked  | Error: "Test connection first"                        |
| Version table missing     | Detect Version clicked  | Warning: "dbo.Version table may not exist"            |
| Unknown schema version    | Detect Version clicked  | Error: "Schema version X.Y is not mapped"             |
| Network timeout           | Either button           | Error: "Unable to connect to database"                |

### Testing

- ✅ Unit tests added for version mapping utility
- ✅ Tests verify all supported version mappings
- ✅ Tests validate both decimal (35.0) and integer (35) format handling
- ✅ Tests confirm null handling for unknown versions
- ✅ All 7 tests passing

## Future Enhancements

- Support for newer Silhouette versions as they're released
- Optional automatic version detection on connection string change
- Caching of detected versions for faster subsequent lookups
- Support for manual override without clearing readonly field
- Batch customer creation with version detection
- Version detection history/audit trail

## Backward Compatibility

- Existing customer records are not affected
- API still validates that `silhouetteVersion` is required before customer creation
- Manual entry is possible if auto-detection fails
- No database schema changes required
- Readonly field can still accept programmatic updates
- Existing workflows continue to work unchanged
