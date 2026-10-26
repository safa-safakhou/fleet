#include <sys/timex.h>
#include <stdio.h>
#include <time.h>
int main(void){struct timex t={0}; int rc=adjtimex(&t); printf("{\"statusReturn\":%d,\"offset\":%ld,\"freqScaled\":%ld,\"freqPpm\":%.9f,\"tickUs\":%ld,\"statusFlags\":%d,\"constant\":%ld,\"maxerror\":%ld,\"esterror\":%ld}\n",rc,t.offset,t.freq,t.freq/65536.0,t.tick,t.status,t.constant,t.maxerror,t.esterror);return rc<0;}
