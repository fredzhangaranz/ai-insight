# Missing Superbills Dashboard

## Changelog

| Revision | Date  | Silhouette Version | Jira ID | Description |
| -------- | ----- | ------------------ | --------| ----------- |
| 1        | 2024-07-09 | 4.17 | | | 


## Background

Correspondence with Amy March 2024:
> Amy:
> Is there a way to pull a patient list and show all the items that are on the left panel without a chart item attached? I want to reconcile visits. Example- if a provider doesn't complete a VISIT DETAILS but they did see the patient, I want to be able to find those patients so we can track visits. 
I want to compare our patient list that don't have DISCHARGE dates to our Visit detail report and ensure they all match. (these would be considered ACTIVE patients). 
>
> The export feature requires me to select a chart item but demographics (where we put the discharge information) is not a chart item, so it is not an option.
>
> Phil:
> I should be able to generate you a report that shows patients with a completed visit details but the reverse could be tricky.  Silhouette doesn’t have any knowledge of which patients should have been visited on a certain day.
> 
> Amy:
> I am more looking for a patient list that can be exported with the patient details/demographics. Then I can compare the two reports and reconcile on our end. The system wouldn't have to reverse it, we would do that part. But I can see who is "active" and who has been discharged. 

## Report Proposal

Proposal is to generate a dashboard with a large table, this can then be exported to Excel etc.  Patient data retrieved and filtered to exclude any patients with a discharge date set (in the past?)

Filtered by:
- Exclude patients with a discharge date set

Information to include in results:
- Patient Name
- Patient ID
- Other patient demographics ...
- Most recent visit details assessment date
