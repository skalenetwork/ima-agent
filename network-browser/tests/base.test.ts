import { describe, beforeAll, test } from "bun:test"

describe("test group", () => {
    beforeAll(() => {
        console.log('bf')
    });
    test("browse test", () => {
        console.log('test')
    })
});
