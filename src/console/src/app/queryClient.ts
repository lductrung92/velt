import { QueryClient } from "@tanstack/react-query";

import i18n from "@/app/i18n";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

/*
 * Everything the API answered is in a language.
 *
 * Requests carry the console's own language (see services/api.ts) and a list
 * answers with the translation of a title where one exists — so a cache filled
 * in Vietnamese is the wrong answer the moment somebody switches to English.
 * The language is not part of any query key: putting it there would mean
 * touching every hook in the app and getting one wrong. Dropping the lot on a
 * switch is one line, and a language switch is a rare, deliberate act whose
 * cost is a page of refetches the user is already waiting through.
 */
i18n.on("languageChanged", () => {
  void queryClient.invalidateQueries();
});
