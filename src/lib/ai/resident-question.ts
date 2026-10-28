import { z } from "zod";

export const residentQuestionSchema = z.object({
  question: z.string().trim().min(3).max(400),
  choices: z.array(z.string().trim().min(1).max(90)).min(2).max(5).optional(),
  inputType: z.enum(["text", "number", "date"]).optional(),
});
export type ResidentQuestion = z.infer<typeof residentQuestionSchema>;
type AnswerControl = {
  question: string;
  inputType: "text" | "number" | "date";
  choices?: string[];
};

// Conversational controls never collect credentials, payment or legal approval.
const privateOrApproval =
  /password|passcode|verification code|one.time code|\b(?:mfa|pin|otp|ssn|sin|cvv)\b|date of birth|birth date|bank account|payment card|credit card|card number|waiver|signature|legal|agree to|accept the|approve|consent|confirm.*(?:book|pay|purchase|reserv)|submit.*(?:book|pay|reserv)/i;

export function residentQuestion(input: ResidentQuestion): AnswerControl | null {
  if (privateOrApproval.test(input.question)) return null;
  const question = input.question.trim();
  const age = /\bage\b|how old/i.test(question);
  const day = /\b(?:day|date|when)\b/i.test(question);
  return {
    question,
    inputType: input.inputType ?? (age ? "number" : "text"),
    ...(input.choices?.length
      ? { choices: [...new Set(input.choices)] }
      : day
        ? { choices: ["Today", "Tomorrow", "This weekend"] }
        : {}),
  };
}

/** A finished direct question still gets a control when the model omits its tool.
 * This is presentation only: answers are sent as ordinary resident messages.
 */
export function questionFromText(text: string): AnswerControl | null {
  const question = text.trim();
  if (
    question.length < 3 ||
    question.length > 400 ||
    !question.endsWith("?") ||
    question.includes("\n\n")
  )
    return null;
  return residentQuestion({ question });
}
