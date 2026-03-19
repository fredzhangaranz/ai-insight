# SAWC Spring 2026 - Poster Materials Index

**Quick Start**: Read `EXECUTIVE_SUMMARY.md` first, then dive into specific documents as needed.

---

## 📄 Document Overview

### 1. **START HERE** → `EXECUTIVE_SUMMARY.md`

**Purpose**: High-level overview of everything created  
**Read time**: 10 minutes  
**Audience**: Everyone involved in the project

**Contains:**

- What we've created and why
- Key messages summary
- Budget and timeline
- Next steps and recommendations

---

### 2. **CONTENT STRATEGY** → `POSTER_CONTENT_GUIDE.md`

**Purpose**: Comprehensive poster content and design guide  
**Read time**: 30-45 minutes  
**Audience**: Designer, content writer, project lead

**Contains:**

- Complete poster text (all sections)
- Executive use cases (5 detailed personas)
- Design specifications (colors, fonts, layout)
- Production checklist and timeline
- CEO talking points

**When to use:**

- Primary reference for creating the poster
- Guide for professional designer
- Content approval and verification

---

### 3. **VISUAL MOCKUP** → `POSTER_MOCKUP.html`

**Purpose**: Interactive visual representation  
**View time**: 2 minutes  
**Audience**: Marketing manager, stakeholders, designer

**How to view:**

```bash
# Option 1: Run the helper script
./view_poster.sh

# Option 2: Start web server manually
cd docs/presentation/SAWC
python3 -m http.server 8080
# Then open: http://localhost:8080/POSTER_MOCKUP.html

# Option 3: Double-click to open in browser (may or may not work)
```

**Contains:**

- Professional layout in 2:1 landscape ratio
- Healthcare color scheme (blues, teal, orange)
- All content sections with visual hierarchy
- Placeholder for screenshots and QR codes

**When to use:**

- Marketing manager review
- Stakeholder presentations
- Designer reference
- Readability testing (view on large screen/projector)

---

### 4. **CLAIMS VERIFICATION** → `HONEST_METRICS_GUIDE.md`

**Purpose**: Truthful, defensible statements and talking points  
**Read time**: 20-30 minutes  
**Audience**: CEO, sales team, legal/compliance

**Contains:**

- ✅ What we CAN say (with sources)
- 🚫 What we CANNOT say (without data)
- Industry benchmarks (HIMSS, KLAS Research)
- Elevator pitches for different audiences
- Objection handling scripts
- Before/after comparison frameworks

**When to use:**

- Verify all marketing claims
- Prepare CEO for conference
- Legal/compliance review
- Create sales materials

---

### 5. **PROJECT MANAGEMENT** → `README.md`

**Purpose**: Complete project documentation and tracking  
**Read time**: 15-20 minutes  
**Audience**: Project manager, entire team

**Contains:**

- Document inventory and descriptions
- Production timeline (week-by-week)
- Budget breakdown ($880-1,800)
- Pre-conference checklist
- Contact information templates
- Success metrics to track

**When to use:**

- Project planning and management
- Team coordination
- Budget approval
- Timeline tracking

---

### 6. **VISUAL CONCEPT** → `SAWC_Poster_Mockup.png`

**Purpose**: AI-generated visual representation  
**View time**: 30 seconds  
**Audience**: Quick reference for everyone

**Location:**

```
~/.cursor/projects/Users-fredzhang-dev-Aranz-ai-dashboard-insight-gen/assets/SAWC_Poster_Mockup.png
```

**Contains:**

- Professional conference poster aesthetic
- Layout and color scheme visualization
- Content hierarchy demonstration

**When to use:**

- Quick visual reference
- Email attachments for stakeholders
- Social media/internal presentations

---

## 🎯 By Role: What to Read

### **If you're the Project Lead:**

1. `EXECUTIVE_SUMMARY.md` - Get overview
2. `README.md` - Understand full scope and timeline
3. `POSTER_CONTENT_GUIDE.md` - Review all content
4. `HONEST_METRICS_GUIDE.md` - Verify claims

### **If you're the Marketing Manager:**

1. `EXECUTIVE_SUMMARY.md` - Quick overview
2. `POSTER_MOCKUP.html` - Visual review
3. `POSTER_CONTENT_GUIDE.md` (sections 1-6) - Content review
4. Provide feedback on messaging and design

### **If you're the Designer:**

1. `POSTER_MOCKUP.html` - Visual reference
2. `POSTER_CONTENT_GUIDE.md` (sections 8-9) - Design specs
3. `EXECUTIVE_SUMMARY.md` - Understand goals
4. Request final text content and screenshots

### **If you're the CEO/Presenter:**

1. `EXECUTIVE_SUMMARY.md` (section: CEO Preparation)
2. `HONEST_METRICS_GUIDE.md` (sections 9-10) - Talking points and objections
3. `POSTER_CONTENT_GUIDE.md` (section 11) - Elevator pitch
4. Practice key messages before conference

### **If you're Legal/Compliance:**

1. `HONEST_METRICS_GUIDE.md` - All claims and sources
2. `POSTER_CONTENT_GUIDE.md` (sections 1-7) - All poster text
3. Verify no unsubstantiated claims
4. Approve final content before printing

---

## ⚡ Quick Actions

### To View the Poster Mockup:

```bash
cd docs/presentation/SAWC
./view_poster.sh
# Opens web server, then visit: http://localhost:8080/POSTER_MOCKUP.html
```

### To Get Executive Summary:

```bash
# Read in terminal
cat docs/presentation/SAWC/EXECUTIVE_SUMMARY.md

# Or open in Cursor/VS Code
code docs/presentation/SAWC/EXECUTIVE_SUMMARY.md
```

### To Print All Documents:

```bash
# From the SAWC directory
cd docs/presentation/SAWC
open *.md  # Opens all markdown files (Mac)
# or
code *.md  # Opens all in VS Code
```

---

## 📋 Checklist: What to Do Now

### **Immediate (Today)**

- [ ] Read `EXECUTIVE_SUMMARY.md`
- [ ] View `POSTER_MOCKUP.html` (run `./view_poster.sh`)
- [ ] Share mockup with marketing manager
- [ ] Identify any immediate concerns or changes needed

### **This Week**

- [ ] Get stakeholder feedback on content and design
- [ ] Send `HONEST_METRICS_GUIDE.md` to legal/compliance
- [ ] Verify booth number and contact information
- [ ] Gather actual platform screenshots (high-res)
- [ ] Decide on design approach (hire designer vs. in-house)

### **Next 2 Weeks**

- [ ] Finalize all content based on feedback
- [ ] Create high-resolution graphics and icons
- [ ] Generate and test QR codes
- [ ] Get legal approval for all claims
- [ ] Begin design production

### **Week 3-4**

- [ ] Complete final design
- [ ] Print test version at smaller scale (A3)
- [ ] Verify readability from 2 meters
- [ ] Send to printer by **March 25** (deadline)
- [ ] Order supporting materials (handouts, business cards)

### **Week 5 (Pre-conference)**

- [ ] Receive printed poster
- [ ] Quality check and review
- [ ] Prepare demo environment
- [ ] Brief CEO on key messages
- [ ] Pack materials for travel

---

## 🎨 Design Options

### **Option A: Professional Designer** (Recommended)

**Cost**: $500-1,000  
**Timeline**: 2-3 weeks  
**Pros**: Polish, credibility, professional result  
**Cons**: Cost, need to find and manage designer

**How to proceed:**

1. Share `POSTER_MOCKUP.html` and `POSTER_CONTENT_GUIDE.md` with designer
2. Request 2-3 initial concepts
3. Iterate to final design
4. Export as print-ready PDF

---

### **Option B: Canva** (DIY)

**Cost**: $0-50 (free or Canva Pro)  
**Timeline**: 1-2 weeks (if you have design skills)  
**Pros**: Cost-effective, full control, fast iteration  
**Cons**: Time investment, may lack polish

**How to proceed:**

1. Create new Canva project (custom size: 200cm × 100cm)
2. Use `POSTER_MOCKUP.html` as layout reference
3. Follow color palette and typography from `POSTER_CONTENT_GUIDE.md`
4. Export as PDF (300 DPI)

---

### **Option C: Adapt HTML** (Technical)

**Cost**: $0 (but time-intensive)  
**Timeline**: Several days  
**Pros**: Free, can make quick changes  
**Cons**: Technical complexity, may not be print-optimal

**How to proceed:**

1. Modify `POSTER_MOCKUP.html` CSS for print
2. Use browser print-to-PDF (set to A3 or larger)
3. Upscale to 300 DPI for printing
4. Test print quality carefully

---

## 💡 Pro Tips

### **Before Design:**

- Get all feedback BEFORE starting design work (changes are expensive later)
- Gather ALL assets first (screenshots, logos, icons)
- Generate QR codes early and verify they work

### **During Design:**

- Print a small test version (A3) and view from 2 meters away
- Text that's readable on screen may be too small in print
- Colors look different on screen vs. print—request color proof

### **After Design:**

- Get legal/compliance final sign-off before printing
- Request a proof from printer before final run
- Order 1-2 business days before deadline (buffer time)

---

## 📞 Questions?

**For content**: Review relevant `.md` file first (likely has your answer)  
**For design**: See `POSTER_CONTENT_GUIDE.md` sections 8-9  
**For claims**: Check `HONEST_METRICS_GUIDE.md`  
**For timeline**: See `README.md` or `EXECUTIVE_SUMMARY.md`

**Still stuck?** Contact project lead or review `EXECUTIVE_SUMMARY.md` recommendations.

---

## 🎯 Success Criteria

**You'll know the poster is ready when:**

✅ All stakeholders have approved content  
✅ Legal/compliance has verified claims  
✅ Design is professional and readable from 3 meters  
✅ QR codes are tested and functional  
✅ Contact information is correct  
✅ File is print-ready (PDF, CMYK, 300 DPI, with bleed)

---

## 📚 File Structure

```
docs/presentation/SAWC/
├── INDEX.md                     # This file - navigation guide
├── EXECUTIVE_SUMMARY.md         # High-level overview (start here)
├── POSTER_CONTENT_GUIDE.md      # Comprehensive content strategy
├── POSTER_MOCKUP.html           # Interactive visual mockup
├── HONEST_METRICS_GUIDE.md      # Claims verification & talking points
├── README.md                    # Project documentation & timeline
├── view_poster.sh               # Helper script to view HTML mockup
└── [Future additions]
    ├── Final_Design_Print.pdf   # Print-ready file (TBD)
    ├── Executive_One_Pager.pdf  # Leave-behind handout (TBD)
    └── CEO_Talking_Points.md    # Detailed presentation guide (TBD)
```

---

**Last Updated**: February 10, 2026  
**Status**: Complete - Ready for Review  
**Next Action**: Marketing manager review of materials
