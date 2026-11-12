// 시험 스크립트 전용: ts-resolve.mjs를 Node에 등록한다. (사용법은 ts-resolve.mjs 참고)
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
