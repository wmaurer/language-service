// 5:15,10:15,14:15,19:12
import * as Effect from "effect/Effect"

Effect.gen(function* (_) {
    Effect.succeed(1)
})

Effect.gen(function* (_) {
    Effect.fail('error')
    Effect.succeed(1)
})

Effect.gen(function* (_) {
    Effect.succeed(1).pipe(Effect.map((a) => a + 1))
})

Effect.gen(function* ($) {
    Effect.succeed(1).pipe(
        Effect.map((a) => a + 1)
    )
})
