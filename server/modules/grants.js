export function sponsorEmail({ team, contactName = 'Community Partner', companyName = 'your organization', amount = 500 } = {}) {
  const teamLabel = /\bFTC\b/i.test(team.name) ? team.name : `${team.name} FTC`;
  return {
    subject: `Supporting ${teamLabel} robotics students`,
    body: `Hi ${contactName},\n\nI am writing on behalf of ${team.name}, an FTC robotics team in ${team.location}. We are building a competition robot for the current FIRST Tech Challenge season and are raising funds for parts, registration, tools, and student outreach.\n\nA sponsorship of $${amount} from ${companyName} would directly support a legal, safe, student-built robot plan with documented budget, engineering calculations, and build checkpoints. We would be glad to recognize your support on team materials and share progress updates throughout the season.\n\nThank you for considering our team,\n${team.name}`,
    tiers: [
      { amount: 250, benefit: 'Team website and social recognition' },
      { amount: 500, benefit: 'Logo on pit display and outreach materials' },
      { amount: 1000, benefit: 'Robot/cart recognition where event rules allow' },
    ],
  };
}

export function grantDraft({ project, amount }) {
  return {
    title: `${project.team.name} FTC Robotics Grant Request`,
    requestedAmount: amount || 1000,
    needStatement: `${project.team.name} needs funding for competition registration, REV Robotics parts, spare components, and outreach materials.`,
    budgetJustification: project.bom,
    impact: 'Funding reduces the burden on students and helps the team build a safe, legal, well-documented robot while learning engineering fundamentals.',
  };
}
