 PRD (Gaurav)

### Executive Summary 

Australian Colleges work with several Education Agents across a dozen source countries to get international students on their campus. Managing them today is a manual patchwork.

Today the onboarding process is fragmented across emails, spreadsheets, shared drives, PRISMS, ASQANet and multiple internal systems.

The Agent Management Portal aim to centralize the entire lifecycle:

* Agent registration  
* Application review  
* Compliance verification  
* Approvals  
* Portal access for Agents  
* Marketing collateral sharing  
* Performance monitoring  
* Generate Agent Invoices  
* Agent Performance Reporting  
* Agent Offboarding 

### Problem Statement

The tertiary Colleges in Australia deal with multiple Agents across the world who sign up as education partners bringing in students to be admitted in these colleges. Currently, the process is fragmented across different layers, driven manually, where the College admin has to onboard the education agent as a partner, and needs to do proper due diligence and verification of the authenticity of the agent. The agent needs to be uploaded to the govt portal like PRISMS, ASQANet and more for proper legal authority to do business with the college. Failure to comply so can attract lot of penalties.  
There is a lack of a centralised portal to manage the agent applications, review and approve them. Then once onboarded, managing the active agents is operationally intensive which requires continuous monitoring of their licenses and accreditation, their student conduct and feedback, and accordingly generate billing invoices and commissions for the agents.    
Overall here are the top 5 problems: 

1. **Onboarding is manual and slow**. Documents arrive by email; compliance checks live in a spreadsheet; references are chased ad-hoc. A new agent takes 4–8 weeks to activate.  
2. **Compliance is fragile**. MARN, QEAC, ASQA, TEQSA and PRISMS records live in different places. Expiries are missed. Audits are painful.  
3. **Performance is invisible**. Enrolments, conversion, visa refusals and student outcomes exist in the CRM or Student management system but are never seen alongside compliance status.  
4. **Agents feel remote**. Marketing collateral is out of date the moment it's shared. Agents don't know the college's expectations, and colleges don't know who to trust.  
5. **Executives fly blind**. There is no repeatable, semi-annual report — every board update is a bespoke scramble.

### Persona 

1. **College Admin (Primary) :** 

   Reviews the new agent application ,onboards them as a partner, and monitor their performance, and generate billing invoices

   **Goal**: Increase efficiency, reduce time and errors while registering new Agent   
   **Jobs to be done:** Review new agent applications, run compliance checks on active Agents, approve/reject with evidence, send agreements, complete government registrations, monitor risk for active agents, publish and share reports.

**Pains:** Fragmented tooling; regulator anxiety; no view of agent risk; manual reporting; email overload.

**Needs**: 

* Enhance visibility by collating and comparing all agent application in one place   
* Minimize the time to process and review new agent details during registration                
* Minimize the time and improve accuracy to verify the uploaded Agent docs.                
* Execute Parallel Approvals to save on time  
* Ensure correct marketing collateral is shared confidentially.

2. **Education Agent (Secondary):**   
   The busines partner to the college bringing in quality students to enroll in the college

   Goal: Easily Onboard on the College Partner list and efficiently able to market the college to the students with the college verified latest collaterals. 

   **Jobs to be done:** 

- Apply to represent the college,  
- upload documents, sign the agreement, download  
- current marketing collateral,   
- submit student applications,   
- track commissions.  
  **Pains:** Waiting weeks on approval with no visibility, receiving outdated brochures, unclear compliance expectations, chasing invoices.

    
  **Needs**: Minimize the time to fill application and get approval.   
  Access to college courses guide and able to sell it better to students.


### Goals

1. **Onboarding Agents Lawfully and in Compliance:** Ability to review the applications from the Agents, do due diligence, verify their credentials and induct them on to the portals.   
   * Cut agent onboarding time from multiple weeks to days  
   * Reduce the chances of cost penalties  
2. **Regulatory Compliance:** Ensure all education agents comply with the ESOS Act, ASQA standards, and applicable Australian laws and regulations.   
   * Target 90%+ college wide compliance score for Partner agents  
3. **Accurate Information:** Provide accurate college collaterals and information to prospective students through these Partner agents. Avoid misleading conduct in all recruitment activities.  Maintain fair, non-discriminatory practices.  
4. **Audit Trails**: Log every action as a tamper-evident audit trail to ensure efficient auditability and also ability to generate executive reports.

### Non-Goals (Phase 1: MVP)

* Student CRM. AMP in future integrates with Salesforce Education Cloud / Zoho / HubSpot; it does not replace them.  
* Multi-college federation. Each college's AMP workspace is standalone in Phase 1\.  
* LLM Chatbot   
* Generating Reports for sharing Agent activity  
* Calculating Commissions based on Agent activity and Performance. Consecutively, not adding payroll/payout execution. Commissions will be calculated in future and posted to the ERP; payment is executed by finance.  
* Focusing on top 6 countries

User Stories

### User Journey Maps

#### 	

#### *User Journey 1: College Admin – Onboard a New Education Agent and Review Application*

**Actor**

**College Admin**

Responsible for reviewing, approving, onboarding, and monitoring education agents while ensuring compliance with Australian regulations.

**Scenario**

A new education agent submits an application through the college website or submit it offline which is uploaded on the College Database. 

The College Admin reviews the application, verifies compliance documents, approves the agent, and provides portal access.

---

| Phase | Actions | Mindset | Priority |
| ----- | ----- | ----- | ----- |
| **Login** | Logs into the AMP using secure credentials (Basic auth/ SSO). | "I want to quickly see today's pending work." | Must have |
| **Dashboard Review**  | Reviews dashboard widgets showing new applications and pending reviews. | "Which applications need my attention first?" | Must have (limited widgets) |
| **View Applications** | Opens the Applications page and filters new requests. | "I need to process these efficiently." | Must have |
| **Review Application** | Opens an application and reviews business details and uploaded documents. | "Is everything complete and genuine?" | Must have with OCR |
| **Verify Documents** | Reviews ASIC registration, QEAC/PIER certificates, MARN (if applicable), and references. | "I must ensure this agent meets compliance requirements." | Must have |
| **AI Summary Review** | Reads AI-generated document summaries and compliance flags. | "This saves me time, but I still need to verify." | Should have |
| **Make Decision** | Approves, rejects, or requests additional information and send official agreement. | "I have enough information to make a decision." | Must have |
| **Agreement Generation** | Generate and share signed agreement via Email, SMS, or WhatsApp. Also get sign from college authorities.  | "The agent can now complete onboarding by signing official agreement." | Must have |
| **Monitor Status** | Tracks whether the agent accepts and send  the signing agreement and completes onboarding. | "I want to ensure onboarding finishes successfully." | Should have |
| **Agent Induction** | Post agreement signing, induct the agent by registering its details in government portals \- PRISMS, ASQAnet, TEQSA registrations | “I want to ensure the agent is officially registered to the required portal to fulfill regulatory compliances” | Should have |
| **Invite Agent**  | Sends portal invitation via Email, SMS, or WhatsApp. | "The agent can now complete onboarding." | Must via Email, nice to have others |

---

#### *User Journey 2: Education Agent – Register with the College* 

**Actor**

**Education Agent**

An education consultancy or recruitment partner applying to represent the college and recruit international students.

**Scenario**

The agent receives an invitation from the college or discovers the application form on the college website and completes the registration process.

**Goal**

* Complete registration quickly  
* Upload required documents once  
* Get approved with minimal delays

---

| Phase | Actions | Mindset | MVP Priority |
| ----- | ----- | ----- | ----- |
| **Complete Application** | Get college partner application form and fills business details and contact information and basic questionnaire . | "I hope this doesn't take too long." |  NA |
| **Upload Documents** | Uploads required certificates and legal documents. | "I want to make sure nothing is missing." | NA |
| **Submit Application** | Reviews information and submits the application. | "Now I hope everything is correct." |  NA |
| **Wait for Review** | Monitors application status. | "I wonder how long approval will take." | NA |
| **Receive Approval** | Gets notified that the application is approved. | "Great\! I can now work with the college." | NA |
| **Login** | Signs in to the Agent Portal. | "Let's see what's available." | Must Have |
| **Access Resources** | Downloads marketing materials and course brochures. | "Everything I need is in one place." | Must Have |

---

#### *User Journey 3: Education Agent – Access Marketing Materials*

**Actor**

Education Agent

**Scenario**

The agent has already been approved and needs the latest marketing materials to recruit students.

**Goal**

* Access the latest documents  
* Avoid outdated marketing collateral  
* Stay compliant with college policies

---

| Phase | Actions | Mindset | MVP Priority |
| ----- | ----- | ----- | ----- |
| **Login** | Logs into the Agent Portal. | "I need the latest course information." | Must |
| **Dashboard** | Notices that new marketing materials are available. | "Looks like there are updates." | Should have |
| **Browse Documents** | Opens the Marketing Collateral section. | "Everything should be organized." | Must |
| **Download Materials** | Downloads brochures, fee schedules, and student handbooks. | "Now I know I'm using the latest versions." | Must |
| **Use Resources** | Shares approved materials with prospective students. | "I'm representing the college with accurate information." | NA |

---

#### *User Journey 4: College Admin – View Active Agents and their profile*

**Actor**

College Admin

**Scenario**

The admin periodically reviews active agents to ensure compliance, monitor performance, and identify issues.

**Goal**

* Identify high-performing agents  
* Detect compliance risks early  
* Take corrective action when needed

| Phase | Actions | Mindset | MVP Priority |
| ----- | ----- | ----- | ----- |
| **Login** | Opens the AMP dashboard. | "I need to check how our agents are performing." | Must |
| **Agents Profile** | College admin see the list of Active Agents and can view individual profile | “I need to see the list of all active agents and the count of students enrolled” | Must |
| **Agents Validity Track** | College Admin can view the validation of the certifications and licenses uploaded by the Agent  | ““I need to see the agent details continue to remain valid and compliant” | Must |
| **Agent Ratings**  | College Admin can view the agent rating based on the enrolled students activity | “I want to monitor the quality of students brought by the Agent” | Should Have |

---

#### *User Journey 5: College Admin – Review Compliance and performance of Active Agent \[ Nice to have\[*

## **Actor**

College Admin

## **Scenario**

The college already has an agent relationship established outside the portal and wants to onboard the agent into AMP.

## **Goal**

* Register existing partners quickly  
* Avoid duplicate records  
* Send invitation immediately

---

| Phase | Actions | Mindset | MVP Priority |
| ----- | ----- | ----- | ----- |
| **1\. Login** | Signs into AMP. | "I need to add a partner we already work with." | Must |
| **2\. View Dashboard** | Reviews KPIs and performance widgets. | "Who needs attention?" | Must |
| **3\. Open Agent Profile** | Reviews an individual agent's activity and performance metrics. | "Are they meeting our standards?" | Must |
| **4\. Check Compliance** | Reviews certification expiry dates and compliance status. | "I don't want any compliance issues." | Nice to have |
| **5\. Take Action** | Contacts the agent, requests updates, or initiates suspension or termination if needed. | "The partnership must remain compliant." | Nice to have |

#### *End-to-End User Flow*

These journeys can be visualized as a single end-to-end flow for the AMP:

College Admin Login

        │

        ▼

Dashboard

        │

        ▼

New Agent Application Received

        │

        ▼

Review Application

        │

        ▼

Verify Documents

        │

        ▼

AI Document Summary

        │

        ▼

Approve / Reject / Request More Information

        │

        ├──────────────┐

        ▼              ▼

Approved           Rejected

        │

        ▼

Send Portal Invitation

        │

        ▼

Agent Receives Invitation

        │

        ▼

Agent Login

        │

        ▼

Complete Profile (if required)

        │

        ▼

Access Marketing Materials

        │

        ▼

Recruit Students

        │

        ▼

Ongoing Performance Monitoring

        │

        ▼

Renew / Suspend / Terminate

These five journey maps comprehensively cover the **MVP user experience** reflected in your wireframes and extend naturally into the later lifecycle stages (performance monitoring and offboarding) defined in the workflow documentation.

App form Link \-\> https://form.jotform.com/230582944198062

**AI Doc Review –**

Zero-Data Retention (ZDR) OCR: Use enterprise-grade endpoints like Google Cloud Document AI or AWS Textract. Sign a Business Associate Agreement (BAA) or Data Processing Agreement (DPA) opting out of data logging. This ensures the cloud provider processes the text in-memory and forgets it instantly.

Transient Storage Strategy: Store uploaded files (Agent Business Registrations, Licenses, Student Passports) in an encrypted cloud bucket (e.g., AWS S3 with KMS encryption) with a Lifecycle Policy that hard-deletes files exactly 24 hours after processing.

Data Masking at Rest: If the university requires your dashboard to show past applications, never store the raw document. Store only the validation metadata

**Review of application**
 what exactly the system checks automatically vs. what the human must verify. 

 | ----- | ----- |
| Required fields completed | **Automate** |
| Required documents uploaded | **Automate** |
| Document type identification | **Automate** |
| OCR / extracting fields | **Automate** |
| Expiry-date extraction | **Automate** |
| Name/company consistency across documents | **Automate** |
| Missing/contradictory information | **Flag automatically** |
| Compliance status | **Assist, don't decide** |
| Document authenticity | **Human decision / external verification** |
| Final approval | **Human only** | 

***Reviewing the application fields***

| Review area | Australian Agent | Overseas Agent | MVP approach |
| ----- | ----- | ----- | ----- |
| **Company identity** | ABN/ACN \+ ASIC | Local business/company registration number | **Mandatory** |
| **Business registration** | ABN Lookup / ASIC | Country-specific government/business registry | **Mandatory** |
| **Legal entity** | ASIC/ABN data | Local registry | **Mandatory** |
| **Registration status** | Active Australian entity | Active/valid foreign entity | **Mandatory** |
| **Business address** | Australian registered address | Overseas registered/business address | **Mandatory** |
| **Director / owners** | ASIC where available | Local company registry where available | **Mandatory where available** |
| **MARN / MARN status** | Relevant if migration services are involved | Same — **not nationality dependent** | **Conditional** |
| **Education-agent training** | Certificate / evidence | Certificate / evidence | **Mandatory** |
| **Australian representative** | Usually unnecessary | Capture \+ verify if provided | **Conditional** |
| **Local agent licence** | N/A in many cases | Check whether agent/recruitment consultancy licensing exists in that country | **Should** |
| **Professional memberships** | Relevant | Relevant | **Should** |
| **Litigation / disputes** | Declaration | Declaration | **Must** |
| **Visa refusal history** | Declaration | Declaration | **Must** |
| **Australian education experience** | Application \+ references | Application \+ references | **Must** |
| **Other Australian institutions represented** | Declaration | Declaration | **Must** |
| **Sub-agents** | Declaration | Declaration | **Must** |
| **References** | 3 references, including Australian education institution | Same requirement from the form | **Must** |
| **Cross-document consistency** | Application ↔ Australian documents | Application ↔ foreign documents | **Must** |
| **Final approval** | College Admin | College Admin | **Must** |



**Non-Functional Requirements**

1. **Compliance**: ESOS Act 2000 · National Code 2018 · Australian Privacy Act · ASQA, TEQSA, Home Affairs record-keeping requirements.  
2. **Security**: SSO (SAML/OIDC), MFA, role-based access, at-rest and in-transit encryption, tamper-evident audit log.  
3. **Reliability**: 99.9% uptime SLA; nightly encrypted backups; 7-year retention.  
4. **Performance**: Dashboard TTI \< 2s on median admin hardware; document scan feedback \< 5s.  
5. **Accessibility**: WCAG 2.2 AA across every screen; keyboard navigable; text ≥ 12.5px in doc surfaces.  
6. **Localisation**: English (AU) UI; agent-side portal supports date/number locale switching

   