export default {
    extends: ["@commitlint/config-conventional"],

    rules: {
        "type-enum": [
            2,
            "always",
            [
                "feat",
                "fix",
                "perf",
                "refactor",
                "improvement",
                "chore",
                "docs",
                "style",
                "test",
                "ci"
            ],
        ],

        "scope-enum": [
            2,
            "always",
            [
                "mobile",
                "catalogue",
                "data",
                "i18n",
                "build",
                "release",
                "deps",
            ],
        ],
    },
};