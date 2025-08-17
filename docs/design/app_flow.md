App Flow Doc

## App Flow Document: InsightGen

### Page 1: The Form Selection Page

This is the first and only page the user sees when they launch the application. The page has a simple, clean layout with a clear title at the top that reads "InsightGen: Select a Form to Analyze". Below this title, the main content area of the page is a list of clickable buttons. Each button in this list corresponds to a single form that exists in the database. For the demo, one button will be labeled "Wound Assessment". There are no other elements or navigation on this page. The user's only possible action is to choose a form to begin the analysis process.
When the user clicks the "Wound Assessment" button, the entire page view changes, transitioning them to the Analysis Page. The application does not have a "back" button; the flow is designed to move forward from this point.

### Page 2: The Analysis Page

The Analysis Page is a single, dynamic page that changes its state based on user actions.
State A: Form Display (Initial State)
Immediately after the user clicks the "Wound Assessment" button on the Form Selection Page, they land on the Analysis Page in its initial state. The page is divided into two main sections. On the left side of the screen, there is a static, visual representation of the "Wound Assessment" form. This view shows all the fields from the form, such as "Etiology" as a dropdown and "Clinical Signs of Infection" as a multi-select box, to give the user a reference for what data is available. This form is not interactive; it is for display only. On the right side of the screen, there is a large, prominent button labeled "Analyze with AI". This is the only interactive element in this state.
When the user clicks the "Analyze with AI" button, the application communicates with the AI backend. The right side of the page, where the button was, now shows a loading indicator while the AI generates questions. The left side showing the form schema remains visible.
State B: Insight Selection
After the loading is complete, the right side of the Analysis Page updates to show a list of categorized questions. For example, a heading will read "Wound Progression and Healing Trajectory", and underneath it, there will be clickable questions like "Show wound healing trend over time". Another heading might say "Treatment Efficacy", with questions like "Compare healing rates for different treatment types". The user can now select one of these questions. The left side of the page showing the form schema is still visible for context.
State C: Single-Patient Context
If the user clicks on a question that is specific to a single patient, such as "Show wound healing trend over time", the right side of the page changes again. It now displays a dropdown menu labeled "Select a Patient". This dropdown is populated with a list of all patients who have "Wound Assessment" data. Below the dropdown is a "Generate Chart" button. The user must first select a patient from the dropdown and then click the "Generate Chart" button to proceed.
State D: Insight Display
This is the final state of the page. It is reached either by the user selecting an "all-patient" question from State B, or by the user selecting a patient and clicking "Generate Chart" in State C. The entire page re-renders to show the final analysis.
This final view has three distinct components arranged on the screen. At the top, a large chart is displayed. For example, if the question was "What are the 5 most common wound etiologies?", this will be a bar chart. If the question was about a single patient's healing trend, this will be a line chart. Below the chart, there are two panels side-by-side. The left panel shows the complete, raw SQL query that the AI generated to get the data, presented with syntax highlighting for readability. The right panel shows the raw data that the SQL query returned, displayed in a simple, clean table. There are no further actions to take from this screen; it is the end of the analysis flow for that question. To analyze something new, the user would need to refresh the application to return to the Form Selection Page.
