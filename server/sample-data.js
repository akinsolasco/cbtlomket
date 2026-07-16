function createSampleStudents(id) {
  return [
    {
      id: id("stu"),
      userId: "LOM001",
      firstName: "Ada",
      lastName: "Johnson",
      groupName: "Digital Skills A",
      email: "ada.johnson@example.com",
      status: "active",
      createdAt: new Date().toISOString()
    },
    {
      id: id("stu"),
      userId: "LOM002",
      firstName: "Chinedu",
      lastName: "Okoro",
      groupName: "Digital Skills A",
      email: "chinedu.okoro@example.com",
      status: "active",
      createdAt: new Date().toISOString()
    },
    {
      id: id("stu"),
      userId: "LOM003",
      firstName: "Mariam",
      lastName: "Bello",
      groupName: "Python Basics",
      email: "mariam.bello@example.com",
      status: "active",
      createdAt: new Date().toISOString()
    }
  ];
}

function createSampleExamSets(id) {
  const q1 = id("q");
  const q2 = id("q");
  const q3 = id("q");
  const q4 = id("q");
  const q5 = id("q");
  const q6 = id("q");
  const q7 = id("q");
  const q8 = id("q");

  return [
    {
      id: id("exam"),
      title: "Digital Skills Foundations and Python Basics",
      subject: "Technology Training",
      durationMinutes: 45,
      passingScore: 60,
      showScoreImmediately: false,
      shuffleQuestions: false,
      instructions:
        "Answer every question. Practical and theory answers will be reviewed by the instructor before final results are released.",
      questions: [
        {
          id: q1,
          type: "multiple-choice",
          topic: "Microsoft Word",
          points: 5,
          prompt: "Which feature is best for applying the same heading style across a Word document?",
          options: [
            { id: `${q1}_a`, text: "Styles", correct: true },
            { id: `${q1}_b`, text: "WordArt", correct: false },
            { id: `${q1}_c`, text: "Mail Merge", correct: false },
            { id: `${q1}_d`, text: "Page Color", correct: false }
          ]
        },
        {
          id: q2,
          type: "multiple-choice",
          topic: "PowerPoint",
          points: 5,
          prompt: "What should you use to keep all PowerPoint slides visually consistent?",
          options: [
            { id: `${q2}_a`, text: "Slide Master", correct: true },
            { id: `${q2}_b`, text: "Animation Pane", correct: false },
            { id: `${q2}_c`, text: "Presenter View", correct: false },
            { id: `${q2}_d`, text: "Notes Page", correct: false }
          ]
        },
        {
          id: q3,
          type: "typed",
          topic: "Python",
          points: 5,
          prompt: "Type the Python keyword used to define a function.",
          acceptedAnswers: ["def"]
        },
        {
          id: q4,
          type: "typed",
          topic: "Excel",
          points: 5,
          prompt: "Type the Excel formula that adds cells A1 to A10.",
          acceptedAnswers: ["=SUM(A1:A10)", "SUM(A1:A10)"]
        },
        {
          id: q5,
          type: "theory",
          topic: "Computer Basics",
          points: 10,
          prompt: "Explain two good habits for protecting files on a shared training computer.",
          rubric:
            "Award marks for mentioning secure passwords, logging out, saving work in the right folder, avoiding unknown USB drives, backups, and not deleting other users' files."
        },
        {
          id: q6,
          type: "practical",
          topic: "PowerPoint Practical",
          points: 15,
          prompt:
            "Create a three-slide presentation for a beginner computer class. Slide 1 should be a title slide, slide 2 should list three learning goals, and slide 3 should include a closing message. Describe exactly what you created.",
          rubric:
            "Check structure, clarity, correct slide count, meaningful learning goals, and professional formatting."
        },
        {
          id: q7,
          type: "practical",
          topic: "Python Practical",
          points: 15,
          prompt:
            "Write a small Python program that asks for a learner's name and prints a welcome message. Paste the code and explain what each line does.",
          rubric:
            "Award marks for input(), variable use, print(), correct syntax, and explanation."
        },
        {
          id: q8,
          type: "theory",
          topic: "Software Use",
          points: 10,
          prompt:
            "A student says Microsoft Excel and Microsoft Word do the same thing because both can contain tables. Explain the difference in simple terms.",
          rubric:
            "Look for Word as document writing/formatting and Excel as spreadsheet calculation, analysis, formulas, and data organization."
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];
}

module.exports = {
  createSampleExamSets,
  createSampleStudents
};
