/**
 * Narrator Personality Configuration
 *
 * Generates a YAML configuration block for the narrator system prompt.
 * This configuration is prepended to the system prompt when the player saves their settings.
 */

export interface NarratorSettings {
  verbosity: number;
  tone: number;
  challenge: number;
  temperature?: number;
  max_tokens?: number;
  lore?: string;
  openingScene?: string;
}

/**
 * Maps verbosity numeric value to descriptive label
 */
export function getVerbosityLabel(value: number): string {
  const labels: Record<number, string> = {
    1: "minimal",
    2: "terse",
    3: "brief",
    4: "balanced",
    5: "detailed",
    6: "verbose",
  };
  return labels[Math.round(value)] ?? "balanced";
}

/**
 * Maps tone numeric value to descriptive label
 */
export function getToneLabel(value: number): string {
  const labels: Record<number, string> = {
    1: "light",
    2: "casual",
    3: "balanced",
    4: "serious",
    5: "mature",
  };
  return labels[Math.round(value)] ?? "balanced";
}

/**
 * Maps challenge numeric value to descriptive label
 */
export function getChallengeLabel(value: number): string {
const labels: Record<number, string> = {
    1: "trivial",
    2: "easy",
    3: "relaxed",
    4: "balanced",
    5: "brutal",
  };
  return labels[Math.round(value)] ?? "balanced";
}

/**
 * Generates the YAML configuration block for narrator personality settings.
 * This provides the AI with both the definitions of what each setting means
 * and the player's current selected values.
 */
export function generateNarratorYamlConfig(settings: NarratorSettings): string {
  const verbosity = settings.verbosity ?? 3;
  const tone = settings.tone ?? 3;
  const challenge = settings.challenge ?? 3;

  return `# NARRATOR PERSONALITY CONFIGURATION
# This configuration controls how you narrate the story.
# Follow these settings precisely in your responses.

narrator_personality:
  # VERBOSITY SETTINGS
  # Controls response length and detail level.
  #
  # Scale definitions:
  #   1 (minimal): 1-2 sentences, bare facts only
  #   2 (terse): 2-3 sentences, essential details only
  #   3 (brief): 3-5 sentences, key information
  #   4 (balanced): 1-2 short paragraphs, standard depth
  #   5 (detailed): 2-3 paragraphs, rich descriptions
  #   6 (verbose): 3+ paragraphs, immersive prose with sensory details
  #
  verbosity:
    value: ${verbosity}
    label: "${getVerbosityLabel(verbosity)}"

  # TONE SETTINGS
  # Controls story atmosphere and thematic weight.
  #
  # Scale definitions:
  #   1 (light): Whimsical, optimistic, family-friendly, comedic moments welcome
  #   2 (casual): Lighthearted adventure, minor dangers, upbeat overall
  #   3 (balanced): Standard fantasy adventure, mix of light and serious
  #   4 (serious): Grounded stakes, moral complexity, darker themes permitted
  #   5 (mature): Dark, gritty, complex moral themes, visceral consequences
  #
  tone:
    value: ${tone}
    label: "${getToneLabel(tone)}"

  # CHALLENGE SETTINGS
  # Controls difficulty and consequence severity.
  #
  # Scale definitions:
  #   1 (trivial): Actions almost always succeed, minimal obstacles
  #   2 (easy): Success is common, failures are gentle learning moments
  #   3 (relaxed): Most reasonable actions succeed, challenges surmountable
  #   4 (balanced): Fair outcomes, actions may partially succeed or fail
  #   5 (brutal): Harsh consequences, success requires clever/careful play
  #
  challenge:
    value: ${challenge}
    label: "${getChallengeLabel(challenge)}"

# ACTIVE CONFIGURATION SUMMARY
# Verbosity: ${verbosity} (${getVerbosityLabel(verbosity)}) - ${getVerbosityDescription(verbosity)}
# Tone: ${tone} (${getToneLabel(tone)}) - ${getToneDescription(tone)}
# Challenge: ${challenge} (${getChallengeLabel(challenge)}) - ${getChallengeDescription(challenge)}

`;
}

function getVerbosityDescription(value: number): string {
  const descriptions: Record<number, string> = {
    1: "Keep responses to 1-2 sentences",
    2: "Keep responses to 2-3 sentences",
    3: "Keep responses to 3-5 sentences",
    4: "Write 1-2 short paragraphs",
    5: "Write 2-3 detailed paragraphs",
    6: "Write 3+ paragraphs with rich detail",
  };
  return descriptions[Math.round(value)] ?? "Write balanced responses";
}

function getToneDescription(value: number): string {
  const descriptions: Record<number, string> = {
    1: "Keep it whimsical and family-friendly",
    2: "Lighthearted adventure with minor stakes",
    3: "Standard fantasy tone",
    4: "Grounded with moral complexity",
    5: "Dark and gritty, visceral consequences",
  };
  return descriptions[Math.round(value)] ?? "Standard fantasy tone";
}

function getChallengeDescription(value: number): string {
  const descriptions: Record<number, string> = {
    1: "Let almost everything succeed",
    2: "Be generous with success",
    3: "Reasonable actions mostly succeed",
    4: "Apply fair and balanced outcomes",
    5: "Apply harsh consequences for mistakes",
  };
  return descriptions[Math.round(value)] ?? "Apply fair outcomes";
}

/**
 * Builds the complete narrator system prompt by combining:
 * 1. The YAML configuration block (with current settings)
 * 2. The base prompt content
 */
export function buildNarratorSystemPrompt(
  baseContent: string,
  settings: NarratorSettings
): string {
  const yamlConfig = generateNarratorYamlConfig(settings);
  return `${yamlConfig}${baseContent}`;
}

