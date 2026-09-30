export const SAMPLE_DSL = `title "Bubble Sort"

read array a with n elements
swapped := true
while swapped {
  swapped := false
  for i := 1 to n - 1 {
    if a[i] > a[i + 1] {
      call swap(a[i], a[i + 1])
      swapped := true
    }
  }
}
switch n {
  case 0 {
    exit return "empty"
  }
  case 1 {
    print "single element"
  }
  default {
    do {
      print a[k]
      k := k + 1
    } while k <= n
  }
}
`;
