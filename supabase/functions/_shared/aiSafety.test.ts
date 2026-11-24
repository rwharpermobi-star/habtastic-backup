import { assert, assertFalse } from "jsr:@std/assert@1";
import { detectCrisis } from "./aiSafety.ts";

Deno.test("crisis phrases trigger the crisis protocol", () => {
  for (const t of ["I want to die", "thinking about suicide", "I might hurt myself", "I just want to end it all", "everyone is better off dead without me"]) {
    assert(detectCrisis(t), t);
  }
});

Deno.test("ordinary messages do not", () => {
  for (const t of ["this workout is killing me", "I died laughing", "help me save money", "I cut sugar this week"]) {
    assertFalse(detectCrisis(t), t);
  }
});
