// 시험 스크립트 전용 도우미: 확장자 없는 상대 경로 import("./types")를 Node가 읽을 수 있게 ".ts"를 붙여 준다.
// Next.js는 확장자 없는 import를 그대로 이해하므로 앱 코드는 바꾸지 않는다.
// 사용법: node --import ./scripts/register-ts.mjs scripts/check-safety.mjs
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (error?.code === "ERR_MODULE_NOT_FOUND" && specifier.startsWith(".")) {
      return nextResolve(`${specifier}.ts`, context);
    }
    throw error;
  }
}
