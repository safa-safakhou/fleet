/* Explicit maintenance tool. Changes rate only; never sets wall time. */
#include <stdio.h>
#include <string.h>
#include <sys/timex.h>
#include <unistd.h>

int main(int argc, char **argv) {
    if (argc != 2 || strcmp(argv[1], "--apply") || sysconf(_SC_CLK_TCK) != 100)
        return 2;
    struct timex before = {0};
    if (adjtimex(&before) < 0)
        return 3;
    struct timex adjustment = {
        .modes = ADJ_TICK | ADJ_FREQUENCY,
        .tick = 10000,
        .freq = 0,
    };
    if (adjtimex(&adjustment) < 0) {
        perror("adjtimex");
        return 4;
    }
    struct timex after = {0};
    if (adjtimex(&after) < 0)
        return 5;
    printf("{\"beforeTick\":%ld,\"afterTick\":%ld,\"afterFrequency\":%ld,\"wallTimeSet\":false}\n",
           before.tick, after.tick, after.freq);
    return 0;
}
