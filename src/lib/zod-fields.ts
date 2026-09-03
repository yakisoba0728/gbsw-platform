import { z } from "zod";

/**
 * 선택 입력 텍스트: null·빈 값은 null로 정규화하고, 앞뒤 공백을 떼며
 * 최대 길이를 넘지 않게 한다. 폼 전송에서 "입력 안 함"은 null이다.
 */
export const optionalText = (max: number) =>
  z
    .preprocess(
      (v) => (v == null ? "" : v),
      z.string().trim().max(max, `${max}자를 넘을 수 없습니다.`),
    )
    .transform((v) => (v.length === 0 ? null : v));

/**
 * 검색어: 빈 문자열은 필터 없음(undefined)으로 정규화하고, 앞뒤 공백을 떼며
 * 최대 길이를 넘지 않게 한다.
 */
export const searchText = (max = 60) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim().length === 0 ? undefined : value,
    z.string().trim().max(max, `검색어는 ${max}자를 넘을 수 없습니다.`).optional(),
  );
