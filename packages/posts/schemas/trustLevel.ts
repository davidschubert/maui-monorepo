import { z } from 'zod'

/**
 * Der Körper der Ernennung (F1 Teilpaket 3).
 *
 * EIN Feld, und zwar der ZIELZUSTAND statt eines Umschalters: ein „toggle"
 * hinge davon ab, was der Absender gerade auf dem Schirm hatte — zwei Klicks
 * aus zwei Fenstern hoben sich sonst gegenseitig auf, und niemand könnte
 * hinterher sagen, was gemeint war. Dieselbe Wahl wie beim Zustands-Schema
 * (`topicState.ts`).
 *
 * Die STUFE steht bewusst nicht im Körper. Von Hand vergeben wird genau eine
 * (die 4); eine Zahl anzunehmen hieße, dass jemand auch 2 schreiben könnte —
 * und damit wären die Schwellen nur noch ein Vorschlag.
 */
export const trustLeaderSchema = z.object({
  leader: z.boolean(),
}).strict()

export type TrustLeaderInput = z.infer<typeof trustLeaderSchema>
