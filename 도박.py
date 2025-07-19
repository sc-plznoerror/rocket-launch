from random import *
wksdor = 10000
money = int(input("배팅할 돈을 입력해주세요."))
if money > wksdor:
    money = int(input("잔액이 부족합니다"))
else:
    wksdor -= money
a = int(random() * 100)
print(f"성공 확률 : {a}%")
# print(li)
li = [0 for i in range(100)]

while a > 0:
    b = int(random() * 100)
    if li[b] == 1:
        continue
    else:
        li[b] += 1
    a -= 1

c = int(random() * 100)

if li[c] == 1:
    print("성공")
    print(f"잔액 : {wksdor + money * 2}")
else:
    print("실패")
    print(f"잔액 : {wksdor - money}")