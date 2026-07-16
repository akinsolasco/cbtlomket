const QUESTION_BANK = [
  {
    id: "bank-word-styles",
    level: "Basic",
    type: "multiple-choice",
    topic: "Microsoft Word",
    points: 5,
    prompt: "Which Word feature lets you apply the same heading format throughout a document?",
    options: [
      { text: "Styles", correct: true },
      { text: "Watermark", correct: false },
      { text: "Mail Merge", correct: false },
      { text: "Track Changes", correct: false }
    ]
  },
  {
    id: "bank-word-saveas",
    level: "Basic",
    type: "multiple-choice",
    topic: "Microsoft Word",
    points: 5,
    prompt: "A learner wants to keep the original document and create a separate copy with a new name. Which command should they use?",
    options: [
      { text: "Save As", correct: true },
      { text: "Close", correct: false },
      { text: "Print", correct: false },
      { text: "Undo", correct: false }
    ]
  },
  {
    id: "bank-word-practical-format",
    level: "Intermediate",
    type: "practical",
    topic: "Microsoft Word",
    points: 15,
    prompt:
      "Create a one-page class notice in Microsoft Word. It must include a bold title, date, three bullet points, and a footer with your name. Describe the formatting choices you used.",
    rubric:
      "Award marks for correct title formatting, date placement, bullet list, footer, readable spacing, and clear description of the completed document."
  },
  {
    id: "bank-excel-sum",
    level: "Basic",
    type: "typed",
    topic: "Microsoft Excel",
    points: 5,
    prompt: "Type the Excel formula that adds the numbers in cells B2 through B10.",
    acceptedAnswers: ["=SUM(B2:B10)", "SUM(B2:B10)"]
  },
  {
    id: "bank-excel-cell-reference",
    level: "Basic",
    type: "multiple-choice",
    topic: "Microsoft Excel",
    points: 5,
    prompt: "In Excel, what does the cell reference C5 mean?",
    options: [
      { text: "Column C, row 5", correct: true },
      { text: "Column 5, row C", correct: false },
      { text: "The fifth worksheet", correct: false },
      { text: "A chart style", correct: false }
    ]
  },
  {
    id: "bank-excel-practical-budget",
    level: "Intermediate",
    type: "practical",
    topic: "Microsoft Excel",
    points: 20,
    prompt:
      "Create a simple weekly expense sheet with columns for Item, Category, Amount, and Date. Add at least five rows and use a formula to calculate the total amount. Explain the formula you used.",
    rubric:
      "Award marks for table structure, five valid rows, accurate total formula, sensible categories, date entries, and explanation of the calculation."
  },
  {
    id: "bank-powerpoint-master",
    level: "Basic",
    type: "multiple-choice",
    topic: "Microsoft PowerPoint",
    points: 5,
    prompt: "Which PowerPoint tool is best for making all slides follow the same design?",
    options: [
      { text: "Slide Master", correct: true },
      { text: "WordArt", correct: false },
      { text: "Find and Replace", correct: false },
      { text: "Freeze Panes", correct: false }
    ]
  },
  {
    id: "bank-powerpoint-practical-training",
    level: "Intermediate",
    type: "practical",
    topic: "Microsoft PowerPoint",
    points: 20,
    prompt:
      "Create a four-slide presentation for a beginner computer class: title slide, learning objectives, class rules, and closing slide. Use a consistent theme and describe the slide content.",
    rubric:
      "Award marks for four correct slides, clear learning objectives, relevant rules, consistent theme, readable text size, and professional slide order."
  },
  {
    id: "bank-computer-input-device",
    level: "Basic",
    type: "multiple-choice",
    topic: "Computer Basics",
    points: 5,
    prompt: "Which of these is an input device?",
    options: [
      { text: "Keyboard", correct: true },
      { text: "Monitor", correct: false },
      { text: "Speaker", correct: false },
      { text: "Projector", correct: false }
    ]
  },
  {
    id: "bank-computer-file-safety",
    level: "Basic",
    type: "theory",
    topic: "Computer Basics",
    points: 10,
    prompt: "Explain two safe habits a learner should follow when using a shared training computer.",
    rubric:
      "Award marks for logging out, using strong passwords, saving in the correct folder, avoiding unknown USB drives, backing up work, and respecting other users' files."
  },
  {
    id: "bank-email-attachment",
    level: "Basic",
    type: "multiple-choice",
    topic: "Email and Internet",
    points: 5,
    prompt: "What should a learner do before opening an email attachment from an unknown sender?",
    options: [
      { text: "Confirm it is safe or ask an instructor", correct: true },
      { text: "Open it immediately", correct: false },
      { text: "Forward it to classmates", correct: false },
      { text: "Rename the file only", correct: false }
    ]
  },
  {
    id: "bank-internet-password",
    level: "Basic",
    type: "theory",
    topic: "Email and Internet",
    points: 10,
    prompt: "Describe three things that make a password stronger and safer.",
    rubric:
      "Award marks for length, mixed characters, uniqueness, avoiding personal information, not sharing passwords, and using a password manager where appropriate."
  },
  {
    id: "bank-python-def",
    level: "Basic",
    type: "typed",
    topic: "Python",
    points: 5,
    prompt: "Type the Python keyword used to create a function.",
    acceptedAnswers: ["def"]
  },
  {
    id: "bank-python-print",
    level: "Basic",
    type: "typed",
    topic: "Python",
    points: 5,
    prompt: "Type the Python function used to display text on the screen.",
    acceptedAnswers: ["print", "print()"]
  },
  {
    id: "bank-python-practical-input",
    level: "Intermediate",
    type: "practical",
    topic: "Python",
    points: 20,
    prompt:
      "Write a Python program that asks for a learner's name and age, then prints a welcome message that includes both values. Paste the code and explain each line.",
    rubric:
      "Award marks for input(), meaningful variable names, print output, correct syntax, inclusion of both name and age, and explanation of each line."
  },
  {
    id: "bank-python-theory-error",
    level: "Basic",
    type: "theory",
    topic: "Python",
    points: 10,
    prompt: "A beginner receives a syntax error in Python. Explain what that usually means and give one example of how to fix it.",
    rubric:
      "Award marks for explaining that syntax errors relate to code structure, examples such as missing colon/quote/parenthesis, and a practical correction."
  }
];

function getQuestionBank() {
  return QUESTION_BANK.map((question) => ({
    ...question,
    options: question.options ? question.options.map((option) => ({ ...option })) : undefined,
    acceptedAnswers: question.acceptedAnswers ? question.acceptedAnswers.slice() : undefined
  }));
}

module.exports = {
  getQuestionBank
};
